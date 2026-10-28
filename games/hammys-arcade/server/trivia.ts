// The Damp Seat on the server: one quiz everyone shares. A lobby, then up to
// eight questions with one player in the hot seat and everyone else (and a
// lot of made-up players) in the crowd, then a pause, again. The question
// bank is games/hammygotchi/src/trivia/questions.json; this keeps time, judges
// the answers and pays the prizes. Rules and numbers: shared/trivia.ts.
//
// What it will not do:
//  - send the right answer before a question closes (the page is told the
//    question and the three answers in this round's order; the right one, the
//    fact and the source come with the reveal);
//  - trust a page's clock: an answer counts if it reaches the server before the
//    question closes (plus a short allowance for the trip), by the server's clock;
//  - pay without limit: every prize is from the house, capped per round, per
//    player per day and for the whole arcade per day.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TRIVIA, type TriviaQuestion } from '@hammygotchi/trivia/bank';
import { stream } from '../shared/fair';
import { MAX_COINS } from '../shared/protocol';
import {
  TRIVIA_CAST,
  TRIVIA_CAST_POOL,
  TRIVIA_CLEAR_BONUS,
  TRIVIA_CONTESTANTS,
  TRIVIA_DAILY_CAP,
  TRIVIA_DECIDE_MS,
  TRIVIA_FLOOR_PRIZE,
  TRIVIA_GRACE_MS,
  TRIVIA_HOUSE_DAILY_CAP,
  TRIVIA_KNOCK_COINS,
  TRIVIA_LADDER,
  TRIVIA_LINES,
  TRIVIA_LOBBY_MS,
  TRIVIA_MAX_HUMANS,
  TRIVIA_MIN_OPEN_MS,
  TRIVIA_MIN_SHARE,
  TRIVIA_PAUSE_MS,
  TRIVIA_POT_CAP,
  TRIVIA_QUESTION_MS,
  TRIVIA_QUIET_QUESTION_MS,
  TRIVIA_REVEAL_MS,
  TRIVIA_SHARE_CAP,
  TRIVIA_TALLY_MS,
  castMember,
  type TriviaEndPub,
  type TriviaHuman,
  type TriviaOutcome,
  type TriviaPayout,
  type TriviaPhase,
  type TriviaQuestionPub,
  type TriviaRevealPub,
  type TriviaRoundPub,
  type TriviaSnapshot,
  type TriviaYou,
} from '../shared/trivia';
import { fail, type Env, type Game, type Res } from './engine';
import type { Player } from './store';

// What is remembered between restarts: who has won what today, and which questions were asked lately.

interface LedgerFile {
  v: 1;
  seq: number;
  used: Record<string, number>;
  earned: Record<string, [string, number]>;
  house: [string, number];
}

export class TriviaLedger {
  /** Question id -> the number of the last time it was asked (higher is more recent). */
  readonly used = new Map<string, number>();
  seq = 0;
  private earned = new Map<string, [string, number]>();
  private house: [string, number] = ['', 0];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private file: string | null,
    private now: () => number,
  ) {}

  load(): void {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const d = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<LedgerFile>;
      this.seq = Number.isSafeInteger(d.seq) ? (d.seq as number) : 0;
      for (const [k, v] of Object.entries(d.used ?? {})) if (Number.isSafeInteger(v)) this.used.set(k, v);
      for (const [k, v] of Object.entries(d.earned ?? {})) if (Array.isArray(v) && typeof v[0] === 'string' && Number.isSafeInteger(v[1])) this.earned.set(k, [v[0], v[1]]);
      if (Array.isArray(d.house) && typeof d.house[0] === 'string' && Number.isSafeInteger(d.house[1])) this.house = [d.house[0], d.house[1]];
    } catch {
      // A damaged file: start fresh; the next save replaces it.
    }
  }

  /** Today, in UTC, as 2026-10-27. */
  day(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  earnedToday(id: string): number {
    const e = this.earned.get(id);
    return e && e[0] === this.day() ? e[1] : 0;
  }

  houseToday(): number {
    return this.house[0] === this.day() ? this.house[1] : 0;
  }

  houseLeft(): number {
    return Math.max(0, TRIVIA_HOUSE_DAILY_CAP - this.houseToday());
  }

  /** How much of `want` this player can be paid today. Records it. */
  grant(id: string, want: number): number {
    const day = this.day();
    const mine = this.earnedToday(id);
    const give = Math.max(0, Math.min(Math.floor(want), TRIVIA_DAILY_CAP - mine, this.houseLeft()));
    if (give > 0) {
      this.earned.set(id, [day, mine + give]);
      this.house = [day, this.houseToday() + give];
      this.touch();
    }
    return give;
  }

  /** A question was asked now. */
  mark(id: string): void {
    this.used.set(id, ++this.seq);
    this.touch();
  }

  private serialize(): string {
    const day = this.day();
    const earned: LedgerFile['earned'] = {};
    for (const [k, v] of this.earned) if (v[0] === day) earned[k] = v;
    const body: LedgerFile = { v: 1, seq: this.seq, used: Object.fromEntries(this.used), earned, house: this.house };
    return JSON.stringify(body);
  }

  private touch(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 2000);
    this.timer.unref?.();
  }

  /** Save now. */
  flush(): void {
    const file = this.file;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, this.serialize());
      renameSync(tmp, file);
    } catch (e) {
      console.error('hammys-arcade: could not save the trivia ledger:', e instanceof Error ? e.message : e);
    }
  }
}

// A round --------------------------------------------------------------------------

interface Bot {
  name: string;
  emoji: string;
  skill: number;
  aff: { general: number; gross: number };
  out: boolean;
  ans: number | null;
  /** When it "answers", as a share of the question's time (for the head count only). */
  at: number;
}

interface Seat {
  id: string;
  name: string;
  emoji: string;
  real: boolean;
  player: Player | null;
  ans: number | null;
}

interface Human {
  p: Player;
  alive: boolean;
  ans: number | null;
  /** Answered at least one question this round. */
  played: boolean;
}

interface Ask {
  i: number;
  q: TriviaQuestion;
  /** The shown answers are the bank's answers in this order. */
  order: number[];
  /** Which shown answer is right. */
  correct: number;
  text: string;
  answers: string[];
  opensAt: number;
  closesAt: number;
  windowMs: number;
  tallyAt: number;
}

interface Round {
  id: number;
  seed: string;
  rng: () => number;
  phase: TriviaPhase;
  startedAt: number;
  phaseAt: number;
  hot: Seat | null;
  bots: Bot[];
  humans: Map<string, Human>;
  i: number;
  ask: Ask | null;
  pot: number;
  asked: Set<string>;
  cats: string[];
  topics: string[];
  reveal: TriviaRevealPub | null;
  end: TriviaEndPub | null;
  after: 'decide' | 'end' | null;
  outcome: TriviaOutcome | null;
  line: string;
}

interface Entrant {
  p: Player;
  /** When they put their hand up for the hot seat (null: crowd only). */
  vol: number | null;
}

export interface TriviaOptions {
  /** Where the ledger is kept; null keeps it in memory only. */
  file?: string | null;
  /** The questions (the whole bank, unless a test says otherwise). */
  bank?: readonly TriviaQuestion[];
  /** Run this many times faster than the real thing (for the tests that use the real server). */
  timeScale?: number;
  /** How many made-up players fill the crowd. */
  cast?: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** A small fast hash of a string to [0, 1), for things that need to come out the same each time (a made-up player's taste). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

export class TriviaGame implements Game {
  readonly id = 'trivia' as const;
  readonly ledger: TriviaLedger;
  private round: Round | null = null;
  private counter = 0;
  private entrants = new Map<string, Entrant>();
  private bank: readonly TriviaQuestion[];
  private scale: number;
  private cast: number;

  constructor(
    private env: Env,
    opts: TriviaOptions = {},
  ) {
    this.bank = opts.bank ?? TRIVIA;
    this.scale = opts.timeScale && opts.timeScale > 0 ? opts.timeScale : 1;
    this.cast = Math.min(TRIVIA_CAST_POOL, Math.max(0, Math.floor(opts.cast ?? TRIVIA_CAST)));
    this.ledger = new TriviaLedger(opts.file ?? null, () => this.env.now());
    this.ledger.load();
  }

  /** A length of time, in this run's speed. */
  private ms(n: number): number {
    return Math.max(1, Math.round(n / this.scale));
  }

  // Words ------------------------------------------------------------------------

  private say(r: Round, key: keyof typeof TRIVIA_LINES, vars: Record<string, string | number> = {}): string {
    const lines = TRIVIA_LINES[key];
    const t: string = lines[Math.floor(r.rng() * lines.length)];
    return t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
  }

  // Public shapes -----------------------------------------------------------------

  private humansPub(r: Round): TriviaHuman[] {
    if (r.phase === 'lobby') return [...this.entrants.values()].map((e) => ({ id: e.p.id, name: e.p.name, emoji: e.p.emoji, alive: true }));
    return [...r.humans.values()].map((x) => ({ id: x.p.id, name: x.p.name, emoji: x.p.emoji, alive: x.alive }));
  }

  private queue(): string[] {
    return [...this.entrants.values()]
      .filter((e) => e.vol !== null)
      .sort((a, b) => (a.vol as number) - (b.vol as number) || (a.p.id < b.p.id ? -1 : 1))
      .slice(0, 8)
      .map((e) => e.p.name);
  }

  private standing(r: Round): number {
    let n = 0;
    for (const b of r.bots) if (!b.out) n++;
    for (const h of r.humans.values()) if (h.alive) n++;
    return n;
  }

  private answeredCount(r: Round, a: Ask, now: number): number {
    let n = 0;
    for (const h of r.humans.values()) if (h.alive && h.ans !== null) n++;
    const frac = (now - a.opensAt) / a.windowMs;
    for (const b of r.bots) if (!b.out && b.ans !== null && (r.phase !== 'ask' || b.at <= frac)) n++;
    return n;
  }

  private qPub(r: Round, now = this.env.now()): TriviaQuestionPub | null {
    const a = r.ask;
    if (!a) return null;
    return {
      text: a.text,
      answers: [...a.answers],
      topic: a.q.topic,
      cat: a.q.cat,
      difficulty: a.q.difficulty,
      opensAt: a.opensAt,
      closesAt: a.closesAt,
      answered: this.answeredCount(r, a, now),
      standing: this.standing(r),
    };
  }

  private pub(r: Round): TriviaRoundPub {
    const waiting = r.phase === 'lobby' ? 0 : [...this.entrants.keys()].filter((id) => !r.humans.has(id) && r.hot?.id !== id).length;
    return {
      id: r.id,
      phase: r.phase,
      startedAt: r.startedAt,
      phaseAt: r.phaseAt,
      hot: r.hot ? { id: r.hot.id, name: r.hot.name, emoji: r.hot.emoji, real: r.hot.real } : null,
      cast: r.bots.map((b) => [b.name, b.emoji]),
      botsOut: r.bots.flatMap((b, i) => (b.out ? [i] : [])),
      humans: this.humansPub(r),
      queue: this.queue(),
      waiting,
      i: r.i,
      total: TRIVIA_LADDER.length,
      pot: r.pot,
      q: this.qPub(r),
      reveal: r.reveal,
      end: r.end,
      line: r.line,
    };
  }

  snapshot(): TriviaSnapshot {
    return { round: this.round ? this.pub(this.round) : null };
  }

  /** The people in the room changed: tell the pages. */
  private crowdChanged(): void {
    const r = this.round;
    if (!r) return;
    this.env.emit('trivia.crowd', { round: r.id, humans: this.humansPub(r), queue: this.queue(), waiting: this.pub(r).waiting });
  }

  you(p: Player): TriviaYou {
    const r = this.round;
    const e = this.entrants.get(p.id);
    let role: TriviaYou['role'] = 'none';
    let alive = false;
    let picked: number | null = null;
    if (r?.hot?.player === p) {
      role = 'hot';
      alive = true;
      picked = r.hot.ans;
    } else if (r?.humans.has(p.id)) {
      const h = r.humans.get(p.id)!;
      role = 'crowd';
      alive = h.alive;
      picked = h.ans;
    } else if (e) {
      role = r?.phase === 'lobby' ? 'crowd' : 'next';
      alive = r?.phase === 'lobby';
    }
    return { role, volunteer: !!e && e.vol !== null, alive, picked, earned: this.ledger.earnedToday(p.id), cap: TRIVIA_DAILY_CAP, houseDry: this.ledger.houseLeft() <= 0 };
  }

  // Time -------------------------------------------------------------------------

  tick(): void {
    for (let guard = 0; guard < 80; guard++) {
      const now = this.env.now();
      const r = this.round;
      if (!r) {
        if (this.env.clients() > 0) this.openLobby(now);
        return;
      }
      if (r.phase === 'lobby') {
        if (now < r.phaseAt) return;
        if (this.env.clients() === 0 && this.entrants.size === 0) {
          this.round = null;
          return;
        }
        this.startRound(r, r.phaseAt);
      } else if (r.phase === 'ask') {
        const a = r.ask!;
        if (now < r.phaseAt && now >= a.tallyAt) {
          a.tallyAt = now + this.ms(TRIVIA_TALLY_MS);
          this.env.emit('trivia.tally', { round: r.id, i: a.i, answered: this.answeredCount(r, a, now), standing: this.standing(r) });
        }
        if (now < r.phaseAt) return;
        this.closeAsk(r);
      } else if (r.phase === 'reveal') {
        if (now < r.phaseAt) return;
        this.afterReveal(r);
      } else if (r.phase === 'decide') {
        if (now < r.phaseAt) return;
        // Nobody answered: the hot seat takes the pot rather than losing it to a nap.
        this.conclude(r, 'took', r.phaseAt);
      } else {
        if (now < r.phaseAt) return;
        if (this.env.clients() > 0) this.openLobby(r.phaseAt);
        else {
          this.round = null;
          this.entrants.clear();
          return;
        }
      }
    }
  }

  nextAt(): number | null {
    const r = this.round;
    if (!r) return null;
    if (r.phase === 'ask') return Math.min(r.phaseAt, r.ask!.tallyAt);
    return r.phaseAt;
  }

  clientsChanged(): void {
    if (!this.round && this.env.clients() > 0) this.open();
  }

  private open(): void {
    this.openLobby(this.env.now());
  }

  shutdown(): void {
    this.ledger.flush();
  }

  // Rounds -----------------------------------------------------------------------

  private openLobby(at: number): void {
    const seed = this.env.newSeed();
    const rng = stream(seed, 'trivia');
    // The made-up crowd: any N of the names, each with a head for the subject.
    const pool = shuffle(Array.from({ length: TRIVIA_CAST_POOL }, (_, i) => i), rng).slice(0, this.cast);
    const bots: Bot[] = pool.map((n) => {
      const [name, emoji] = castMember(n);
      const u = rng();
      return { name, emoji, skill: 0.1 + 0.85 * (u * u * (3 - 2 * u)), aff: { general: (rng() - 0.5) * 0.24, gross: (rng() - 0.5) * 0.24 }, out: false, ans: null, at: 0 };
    });
    const r: Round = {
      id: ++this.counter,
      seed,
      rng,
      phase: 'lobby',
      startedAt: at,
      phaseAt: at + this.ms(TRIVIA_LOBBY_MS),
      hot: null,
      bots,
      humans: new Map(),
      i: -1,
      ask: null,
      pot: 0,
      asked: new Set(),
      cats: [],
      topics: [],
      reveal: null,
      end: null,
      after: null,
      outcome: null,
      line: '',
    };
    r.line = this.say(r, 'lobby');
    this.round = r;
    this.env.emit('trivia.round', { round: this.pub(r) });
    this.env.wake();
  }

  /** The lobby is over: pick who sits, and ask the first question. */
  private startRound(r: Round, at: number): void {
    const vols = [...this.entrants.values()].filter((e) => e.vol !== null).sort((a, b) => (a.vol as number) - (b.vol as number) || (a.p.id < b.p.id ? -1 : 1));
    const chosen = vols[0];
    if (chosen) {
      chosen.vol = null;
      r.hot = { id: chosen.p.id, name: chosen.p.name, emoji: chosen.p.emoji, real: true, player: chosen.p, ans: null };
    } else {
      const [name, emoji] = TRIVIA_CONTESTANTS[Math.floor(r.rng() * TRIVIA_CONTESTANTS.length)];
      r.hot = { id: 'contestant', name, emoji, real: false, player: null, ans: null };
    }
    for (const e of this.entrants.values()) if (e.p.id !== r.hot.id) r.humans.set(e.p.id, { p: e.p, alive: true, ans: null, played: false });
    r.line = this.say(r, chosen ? 'sits' : 'nobody', { hot: r.hot.name });
    this.openAsk(r, at);
  }

  /** Which question next: of the right difficulty, from the least recently asked half, mixing the two kinds and the topics. */
  private pick(r: Round, i: number): TriviaQuestion {
    const d = TRIVIA_LADDER[i];
    let tier = this.bank.filter((q) => q.difficulty === d && !r.asked.has(q.id));
    if (!tier.length) tier = this.bank.filter((q) => !r.asked.has(q.id));
    // Oldest first (never asked first), the ties in a random order.
    const keyed = shuffle([...tier], r.rng).sort((a, b) => (this.ledger.used.get(a.id) ?? 0) - (this.ledger.used.get(b.id) ?? 0));
    let window = keyed.slice(0, Math.max(1, Math.ceil(keyed.length / 2)));
    // Gross or general: leaning 40/60, never three of a kind in a row.
    const last = r.cats.slice(-2);
    const wantGross = last.length === 2 && last[0] === last[1] ? last[0] !== 'gross' : r.rng() < 0.4;
    const kind = window.filter((q) => (q.cat === 'gross') === wantGross);
    if (kind.length) window = kind;
    const fresh = window.filter((q) => q.topic !== r.topics[r.topics.length - 1]);
    if (fresh.length) window = fresh;
    return window[Math.floor(r.rng() * window.length)];
  }

  /** How likely a made-up player is to really know this one. */
  private knows(b: Bot, q: TriviaQuestion, r: Round, botIndex: number, bonus = 0): number {
    const base = q.difficulty === 1 ? 0.5 + 0.45 * b.skill : q.difficulty === 2 ? 0.2 + 0.55 * b.skill : 0.02 + 0.5 * b.skill;
    const cat = q.cat === 'gross' ? b.aff.gross : b.aff.general;
    const topic = (hash01(`${r.seed}:${botIndex}:${q.topic}`) - 0.5) * 0.2;
    return clamp(base + cat + topic + bonus, 0.02, 0.97);
  }

  private openAsk(r: Round, at: number): void {
    const i = r.i + 1;
    const q = this.pick(r, i);
    r.asked.add(q.id);
    r.cats.push(q.cat);
    r.topics.push(q.topic);
    this.ledger.mark(q.id);
    const order = shuffle([0, 1, 2], r.rng);
    const correct = order.indexOf(q.correct);
    const live = (r.hot?.real ? 1 : 0) + [...r.humans.values()].filter((h) => h.alive).length;
    const windowMs = this.ms(live ? TRIVIA_QUESTION_MS : TRIVIA_QUIET_QUESTION_MS);
    // The tempting wrong answer: made-up players who don't know lean toward the same one.
    const wrong = [0, 1, 2].filter((k) => k !== correct);
    const tempt = wrong[Math.floor(r.rng() * 2)];
    const guess = (): number => {
      const knows = r.rng() < 1 / 3;
      if (knows) return correct;
      return r.rng() < 0.65 ? tempt : wrong.find((k) => k !== tempt)!;
    };
    r.bots.forEach((b, bi) => {
      if (b.out) return;
      const k = this.knows(b, q, r, bi);
      const slow = r.rng() < 0.03;
      const knew = r.rng() < k;
      const g = guess();
      b.ans = slow ? null : knew ? correct : g;
      b.at = 0.1 + 0.85 * Math.pow(r.rng(), 1.3);
    });
    const hot = r.hot!;
    hot.ans = null;
    if (!hot.real) {
      // The made-up contestant is a decent player with a lot of nerve.
      const bot: Bot = { name: hot.name, emoji: hot.emoji, skill: 0.65, aff: { general: 0, gross: 0 }, out: false, ans: null, at: 0 };
      hot.ans = r.rng() < this.knows(bot, q, r, 999, 0.05) ? correct : guess();
    }
    for (const h of r.humans.values()) h.ans = null;
    r.ask = { i, q, order, correct, text: q.q, answers: order.map((k) => q.answers[k]), opensAt: at, closesAt: at + windowMs, windowMs, tallyAt: at + this.ms(TRIVIA_TALLY_MS) };
    r.i = i;
    r.phase = 'ask';
    r.phaseAt = r.ask.closesAt + this.ms(TRIVIA_GRACE_MS);
    r.reveal = null;
    this.env.emit('trivia.ask', { round: r.id, i, hot: r.hot && { id: r.hot.id, name: r.hot.name, emoji: r.hot.emoji, real: r.hot.real }, humans: this.humansPub(r), q: this.qPub(r, at), line: r.line, pot: r.pot, cast: i === 0 ? r.bots.map((b) => [b.name, b.emoji]) : undefined });
    this.env.wake();
  }

  /** When every real player still in has answered, don't make them wait out the clock. */
  private maybeClose(r: Round): void {
    const a = r.ask;
    if (!a || r.phase !== 'ask') return;
    const waiting = [...r.humans.values()].some((h) => h.alive && h.ans === null) || (r.hot?.real && r.hot.ans === null);
    const anyone = r.hot?.real || [...r.humans.values()].some((h) => h.alive);
    if (waiting || !anyone) return;
    const now = this.env.now();
    const at = Math.max(now + this.ms(300), a.opensAt + this.ms(TRIVIA_MIN_OPEN_MS));
    if (at + this.ms(100) >= a.closesAt) return;
    a.closesAt = at;
    r.phaseAt = at + this.ms(TRIVIA_GRACE_MS);
    this.env.emit('trivia.closing', { round: r.id, i: a.i, closesAt: at });
    this.env.wake();
  }

  /** The clock ran out: who was right, who is out, what the pot is. */
  private closeAsk(r: Round): void {
    const a = r.ask!;
    const at = r.phaseAt;
    const counts = [0, 0, 0];
    const outBots: number[] = [];
    const outHumans: string[] = [];
    r.bots.forEach((b, bi) => {
      if (b.out) return;
      if (b.ans !== null) counts[b.ans]++;
      if (b.ans !== a.correct) {
        b.out = true;
        outBots.push(bi);
      }
    });
    for (const h of r.humans.values()) {
      if (!h.alive) continue;
      if (h.ans !== null) {
        counts[h.ans]++;
        h.played = true;
      }
      if (h.ans !== a.correct) {
        h.alive = false;
        outHumans.push(h.p.id);
      }
    }
    const hot = r.hot!;
    if (hot.real && hot.ans !== null) {
      const owner = this.entrants.get(hot.id);
      if (owner) owner.vol = null;
    }
    const hotOk = hot.ans === a.correct;
    const knocked = outBots.length + outHumans.length;
    const potAdd = Math.min(TRIVIA_POT_CAP - r.pot, knocked * TRIVIA_KNOCK_COINS * a.q.difficulty);
    r.pot += potAdd;
    const left = this.standing(r);
    let line: string;
    if (!hotOk) {
      line = this.say(r, 'wrong', { hot: hot.name });
      r.after = 'end';
      r.outcome = 'busted';
    } else if (a.i >= TRIVIA_LADDER.length - 1) {
      line = this.say(r, 'cleared', { hot: hot.name });
      r.after = 'end';
      r.outcome = 'cleared';
    } else if (left === 0) {
      line = this.say(r, 'wiped', { hot: hot.name });
      r.after = 'end';
      r.outcome = 'wiped';
    } else {
      line = this.say(r, knocked >= 12 ? 'carnage' : knocked <= 3 ? 'quiet' : 'right', { hot: hot.name, n: knocked });
      r.after = 'decide';
    }
    r.reveal = { correct: a.correct, counts, hotPick: hot.ans, hotOk, outBots, outHumans, potAdd, pot: r.pot, fact: a.q.fact, source: a.q.source, text: a.text, answers: [...a.answers] };
    r.line = line;
    r.phase = 'reveal';
    r.phaseAt = at + this.ms(TRIVIA_REVEAL_MS);
    this.env.emit('trivia.reveal', { round: r.id, i: a.i, reveal: r.reveal, line, standing: left });
  }

  private afterReveal(r: Round): void {
    const at = r.phaseAt;
    if (r.after === 'end') return this.conclude(r, r.outcome ?? 'busted', at);
    if (!r.hot!.real) return this.openAsk(r, at);
    r.phase = 'decide';
    r.phaseAt = at + this.ms(TRIVIA_DECIDE_MS);
    r.line = this.say(r, 'decide', { pot: r.pot, hot: r.hot!.name });
    this.env.emit('trivia.decide', { round: r.id, i: r.i, pot: r.pot, until: r.phaseAt, line: r.line });
  }

  private credit(p: Player | null, coins: number): void {
    if (!p || coins <= 0) return;
    p.coins = Math.min(MAX_COINS, p.coins + coins);
    this.env.store.touch();
  }

  /** The round is over: pay what is due, say how it went, clear out the ones who weren't playing. */
  private conclude(r: Round, outcome: TriviaOutcome, at: number): void {
    const hot = r.hot!;
    const payouts: TriviaPayout[] = [];
    if (outcome === 'busted') {
      const standing = this.standing(r);
      const prize = Math.max(r.pot, TRIVIA_FLOOR_PRIZE);
      const due = clamp(Math.floor(prize / Math.max(1, standing)), TRIVIA_MIN_SHARE, TRIVIA_SHARE_CAP);
      for (const h of r.humans.values()) {
        if (!h.alive) continue;
        const paid = this.ledger.grant(h.p.id, due);
        this.credit(h.p, paid);
        payouts.push({ id: h.p.id, name: h.p.name, role: 'crowd', due, paid });
      }
      r.line = this.say(r, 'wrong', { hot: hot.name });
    } else {
      const due = r.pot + (outcome === 'cleared' ? TRIVIA_CLEAR_BONUS : 0);
      if (hot.real) {
        const paid = this.ledger.grant(hot.id, due);
        this.credit(hot.player, paid);
        payouts.push({ id: hot.id, name: hot.name, role: 'hot', due, paid });
      }
      r.line = this.say(r, outcome === 'took' ? 'took' : outcome === 'wiped' ? 'wiped' : 'cleared', { hot: hot.name, pot: r.pot });
    }
    r.end = { outcome, pot: r.pot, payouts, nextAt: at + this.ms(TRIVIA_PAUSE_MS) };
    r.outcome = outcome;
    r.phase = 'end';
    r.phaseAt = r.end.nextAt;
    // Whoever sat out the whole round (never answered) is out of the next one until they join again.
    for (const [id, h] of r.humans) if (!h.played) this.entrants.delete(id);
    if (!hot.real) this.entrants.delete(hot.id);
    this.env.emit('trivia.end', { round: r.id, end: r.end, line: r.line });
    this.env.wake();
  }

  // Players ----------------------------------------------------------------------

  handle(action: string, p: Player, body: Record<string, unknown>): Res | null {
    switch (action) {
      case 'status':
        this.tick();
        return { ok: true, you: this.you(p) };
      case 'join':
      case 'volunteer':
      case 'leave':
      case 'answer':
      case 'take':
      case 'go':
        break;
      default:
        return null;
    }
    this.tick();
    const r = this.round;
    const now = this.env.now();
    if (action === 'join' || action === 'volunteer') {
      const wantsHot = action === 'volunteer' ? body.on !== false : body.hot === true;
      const seated = r?.hot?.player === p;
      if (seated) return { ok: true, you: this.you(p) };
      const had = this.entrants.get(p.id);
      if (!had && this.entrants.size >= TRIVIA_MAX_HUMANS) return fail('full', 'The crowd is full. Try the next one.');
      if (!had) this.entrants.set(p.id, { p, vol: wantsHot ? now : null });
      else if (action === 'volunteer') had.vol = wantsHot ? (had.vol ?? now) : null;
      else if (wantsHot && had.vol === null) had.vol = now;
      this.crowdChanged();
      if (!r) this.clientsChanged();
      return { ok: true, you: this.you(p) };
    }
    if (action === 'leave') {
      if (r?.hot?.player === p) return fail('busy', 'You are in the hot seat. Answer, or take the pot.');
      this.entrants.delete(p.id);
      const h = r?.humans.get(p.id);
      if (h) h.alive = false;
      this.crowdChanged();
      return { ok: true, you: this.you(p) };
    }
    if (action === 'answer') {
      if (!r || r.phase !== 'ask' || !r.ask) return fail('late', 'No question is open.');
      const choice = body.choice;
      if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice > 2) return fail('bad_request', 'Pick one of the three.');
      if (body.round !== r.id || body.i !== r.ask.i) return fail('late', 'That question is gone.');
      const seat = r.hot?.player === p ? r.hot : null;
      const human = seat ? null : r.humans.get(p.id);
      if (!seat && !human) return fail('not_in', 'You are not in this one. Join the next.');
      if (human && !human.alive) return fail('out', 'You are out of this one.');
      // By the server's clock, when it arrived.
      if (now > r.phaseAt) return fail('late', 'Too late.');
      if ((seat ? seat.ans : human!.ans) !== null) return fail('already', 'You already answered.');
      if (seat) seat.ans = choice;
      else human!.ans = choice;
      this.maybeClose(r);
      return { ok: true, you: this.you(p) };
    }
    // take / go: the hot seat's choice after a right answer.
    if (!r || r.hot?.player !== p) return fail('not_in', 'Only the hot seat can do that.');
    if (r.phase !== 'decide') return fail('late', 'Not now.');
    if (action === 'take') this.conclude(r, 'took', now);
    else this.openAsk(r, now);
    return { ok: true, you: this.you(p) };
  }

  /** For /health and the tests. */
  get current(): { id: number; phase: string } | null {
    return this.round ? { id: this.round.id, phase: this.round.phase } : null;
  }
}
