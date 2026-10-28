// Pizza Boxes on the server. Everyone plays their own round (like Poop
// Plinko, nobody shares a board), but every round is on a table the rest of
// the arcade can watch: each box opening, Dr. Moss's offer and the answer go
// out to every page as they happen.
//
// The server decides everything. A bet takes the coins from the wallet, draws
// a seed, publishes its hash, and lays the twenty boxes from the seed
// (dealLayoutOf, the same function the page uses to check it). The rules
// are games/hammygotchi/src/deal.ts, run here unchanged; the page only ever
// sends what the player chose.
//
// Nothing leaks: what goes out is `DealTable`, which has the prizes of boxes
// that have been opened and nothing else. The seed, and with it the whole
// floor, comes out when the round ends.
//
// A round survives a restart. Its seed and its moves are saved in the wallet
// file (Store.keep), so one write holds the coins and the round, and on start
// the round is played again from its moves. A round nobody has touched for
// DEAL_IDLE_MS settles itself the way leaving does (DealRound.leave: the offer
// on the table is taken, otherwise your box's prize is paid, and before a box
// is picked the bet comes back).
//
// While it's quiet one of the made-up cast plays a round to watch.
import { BOXES, DealRound, type DealEvent } from '@hammygotchi/deal';
import { ROCKET_CROWD } from '@hammygotchi/rocket';
import { randomInt } from 'node:crypto';
import { dealLayoutOf } from '../shared/derive';
import { commit } from '../shared/fair';
import { DEAL_IDLE_MS, DEAL_LIVE_MAX, DEAL_REACTS, type DealTable } from '../shared/protocol';
import { amountOf, fail, type Env, type Game, type Res } from './engine';
import { Buckets } from './limits';
import type { Player } from './store';

const BOT_BETS = [5, 10, 20, 25, 50, 100, 250];

/** One move, as it is saved: pick a box, open a box, answer the phone, swap or keep, walk away. */
type Act = ['p', number] | ['o', number] | ['a', 0 | 1] | ['s', 0 | 1] | ['l'];

interface Table {
  id: number;
  who: string;
  name: string;
  emoji: string;
  real: boolean;
  bet: number;
  seed: string;
  hash: string;
  round: DealRound;
  acts: Act[];
  startedAt: number;
  /** The last time anything happened. */
  lastAt: number;
  /** The made-up cast: when they next do something, and how nerve-racking they find an offer. */
  bot?: { at: number; nerve: number };
}

interface SavedTable {
  id: number;
  who: string;
  name: string;
  emoji: string;
  bet: number;
  seed: string;
  acts: Act[];
  startedAt: number;
  lastAt: number;
}

export class DealGame implements Game {
  readonly id = 'deal' as const;
  /** Rounds on now, by number. */
  private tables = new Map<number, Table>();
  /** Real players' rounds, by player. */
  private byPlayer = new Map<string, Table>();
  private counter = 0;
  private botAt: number | null = null;
  private startLimit: Buckets;
  private reactLimit: Buckets;
  private tableReactLimit: Buckets;

  constructor(private env: Env) {
    // A round a minute for anyone; a reaction every three seconds, and not more than a handful a table.
    this.startLimit = new Buckets(4, 1 / 15, () => env.now());
    this.reactLimit = new Buckets(1, 1 / 3, () => env.now());
    this.tableReactLimit = new Buckets(6, 0.5, () => env.now());
    this.restore(env.store.keep('deal', () => this.save()));
    if (this.tables.size) env.wake();
  }

  // Saving and coming back -----------------------------------------------------

  private save(): { next: number; tables: SavedTable[] } {
    const tables: SavedTable[] = [];
    for (const t of this.tables.values()) {
      if (!t.real) continue;
      tables.push({ id: t.id, who: t.who, name: t.name, emoji: t.emoji, bet: t.bet, seed: t.seed, acts: t.acts, startedAt: t.startedAt, lastAt: t.lastAt });
    }
    return { next: this.counter, tables };
  }

  /** Pick the rounds up where the file left them, and square up any stake that has no round (or the other way round). */
  private restore(saved: unknown): void {
    const s = (saved && typeof saved === 'object' ? saved : {}) as { next?: unknown; tables?: unknown };
    if (typeof s.next === 'number' && Number.isSafeInteger(s.next) && s.next >= 0) this.counter = s.next;
    const now = this.env.now();
    const store = this.env.store;
    for (const d of Array.isArray(s.tables) ? (s.tables as Partial<SavedTable>[]) : []) {
      if (!d || typeof d.id !== 'number' || typeof d.who !== 'string' || typeof d.seed !== 'string' || typeof d.bet !== 'number' || !Array.isArray(d.acts)) continue;
      const p = store.players.get(d.who);
      // The wallet and the round are saved together; if they disagree, the wallet wins and the round is dropped.
      if (!p || p.stakes.deal !== d.bet || this.byPlayer.has(p.id)) continue;
      let round: DealRound;
      try {
        round = new DealRound(dealLayoutOf(d.seed));
      } catch {
        continue;
      }
      const acts: Act[] = [];
      for (const a of d.acts as Act[]) if (Array.isArray(a) && this.play(round, a).length) acts.push(a);
      if (round.phase === 'done') continue;
      const t: Table = {
        id: d.id,
        who: p.id,
        name: typeof d.name === 'string' ? d.name : p.name,
        emoji: typeof d.emoji === 'string' ? d.emoji : p.emoji,
        real: true,
        bet: d.bet,
        seed: d.seed,
        hash: commit(d.seed),
        round,
        acts,
        startedAt: typeof d.startedAt === 'number' ? d.startedAt : now,
        // A restart gives everyone a full wait again: the time it was down isn't theirs to lose.
        lastAt: now,
      };
      this.tables.set(t.id, t);
      this.byPlayer.set(p.id, t);
      this.counter = Math.max(this.counter, t.id);
    }
    // A stake on a round that didn't come back goes back to the player.
    for (const p of store.players.values()) if (p.stakes.deal !== undefined && !this.byPlayer.has(p.id)) store.giveBack(p, 'deal');
  }

  // What everyone may see ---------------------------------------------------------

  private pub(t: Table): DealTable {
    const r = t.round;
    const out: DealTable = {
      id: t.id,
      who: t.who,
      name: t.name,
      emoji: t.emoji,
      real: t.real,
      bet: t.bet,
      hash: t.hash,
      v: t.acts.length,
      phase: r.phase,
      mine: r.mine,
      round: r.round,
      toOpen: r.toOpen,
      offer: r.offer,
      opened: r.events.flatMap((e) => (e.type === 'opened' ? [{ box: e.box, prize: e.prize }] : [])),
      lastBox: r.lastBox,
      startedAt: t.startedAt,
      expiresAt: t.real ? t.lastAt + DEAL_IDLE_MS : 0,
    };
    // Only once it's over: how it ended, and the seed that lays out every box.
    if (r.phase === 'done' && r.outcome) {
      out.outcome = r.outcome;
      out.seed = t.seed;
    }
    return out;
  }

  snapshot(): { live: DealTable[] } {
    const live = [...this.tables.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, DEAL_LIVE_MAX);
    return { live: live.map((t) => this.pub(t)) };
  }

  /** Play one move on a round. Returns what happened (empty if it wasn't allowed). */
  private play(r: DealRound, a: Act): DealEvent[] {
    switch (a[0]) {
      case 'p':
        return r.pick(a[1]);
      case 'o':
        return r.open(a[1]);
      case 'a':
        return r.answer(a[1] === 1);
      case 's':
        return r.swap(a[1] === 1);
      default: {
        if (r.phase === 'done') return [];
        const before = r.events.length;
        r.leave();
        return r.events.slice(before);
      }
    }
  }

  // Playing --------------------------------------------------------------------

  /** Do a move for a table; settle it if that was the end; tell everyone. Null if the move isn't allowed now. */
  private move(t: Table, a: Act): { events: DealEvent[]; won: number } | null {
    const events = this.play(t.round, a);
    if (!events.length) return null;
    t.acts.push(a);
    t.lastAt = this.env.now();
    let won = 0;
    if (t.round.phase === 'done') won = this.settle(t);
    this.env.emit('deal.step', { table: this.pub(t), events });
    this.env.store.touch();
    if (t.round.phase !== 'done') this.env.wake();
    return { events, won };
  }

  /** The round is over: pay it (or give the bet back), and take the table down. */
  private settle(t: Table): number {
    const o = t.round.outcome;
    this.tables.delete(t.id);
    if (!t.real) return 0;
    this.byPlayer.delete(t.who);
    const p = this.env.store.players.get(t.who);
    if (!p || !o) return 0;
    if (o.how === 'refund') {
      this.env.store.giveBack(p, 'deal');
      return t.bet;
    }
    return this.env.store.win(p, 'deal', o.mult);
  }

  tick(): void {
    const now = this.env.now();
    for (const t of [...this.tables.values()]) {
      if (t.real) {
        if (now >= t.lastAt + DEAL_IDLE_MS) this.move(t, ['l']);
      } else if (this.env.clients() === 0) {
        // Nobody to watch: the cast goes home.
        this.tables.delete(t.id);
      } else if (t.bot && now >= t.bot.at) {
        this.botMove(t, now);
      }
    }
    this.botStart(now);
  }

  nextAt(): number | null {
    let next: number | null = null;
    const min = (x: number) => {
      if (next === null || x < next) next = x;
    };
    for (const t of this.tables.values()) {
      if (t.real) min(t.lastAt + DEAL_IDLE_MS);
      else if (t.bot) min(t.bot.at);
    }
    if (this.env.clients() > 0 && this.botAt !== null && ![...this.tables.values()].some((t) => !t.real)) min(this.botAt);
    return next;
  }

  clientsChanged(): void {
    if (this.env.clients() > 0 && this.botAt === null) {
      this.botAt = this.env.now() + 2500;
      this.env.wake();
    }
    if (this.env.clients() === 0) this.botAt = null;
  }

  shutdown(): void {
    // Rounds carry on after a restart: they're saved with the wallets. Make sure that write happens.
    this.env.store.touch();
  }

  // The cast --------------------------------------------------------------------

  /** A made-up player sits down when nobody real is playing. */
  private botStart(now: number): void {
    if (this.env.clients() === 0) {
      this.botAt = null;
      return;
    }
    if (this.botAt === null) this.botAt = now + 2500;
    if (now < this.botAt) return;
    const live = [...this.tables.values()];
    if (live.some((t) => !t.real)) return;
    this.botAt = now + 6000 + randomInt(6000);
    // Only when it's quiet.
    if (live.length) return;
    const i = randomInt(ROCKET_CROWD.length);
    const c = ROCKET_CROWD[i];
    const seed = this.env.newSeed();
    const t: Table = {
      id: ++this.counter,
      who: `b${i}`,
      name: c.name,
      emoji: c.emoji,
      real: false,
      bet: BOT_BETS[randomInt(BOT_BETS.length)],
      seed,
      hash: commit(seed),
      round: new DealRound(dealLayoutOf(seed)),
      acts: [],
      startedAt: now,
      lastAt: now,
      // Some of them are cowards and some of them are not.
      bot: { at: now + 2500, nerve: 0.6 + Math.random() * 0.45 },
    };
    this.tables.set(t.id, t);
    this.env.emit('deal.step', { table: this.pub(t), events: [] });
  }

  private botMove(t: Table, now: number): void {
    const r = t.round;
    const pickFrom = (xs: number[]) => xs[randomInt(xs.length)];
    const all = Array.from({ length: BOXES }, (_, i) => i);
    let act: Act;
    let wait = 1800 + randomInt(1800);
    switch (r.phase) {
      case 'pick':
        act = ['p', pickFrom(all)];
        break;
      case 'open':
        act = ['o', pickFrom(r.openable)];
        // A pause after the last box of a round, while the phone rings.
        if (r.toOpen === 1) wait = 2600;
        break;
      case 'call':
        // Dr. Moss's offer against what the boxes are worth now. The nervier ones take it sooner.
        act = ['a', (r.offer ?? 0) >= r.average * (t.bot?.nerve ?? 1) ? 1 : 0];
        wait = 2400 + randomInt(2400);
        break;
      case 'swap':
        act = ['s', randomInt(2) as 0 | 1];
        wait = 3000;
        break;
      default:
        this.tables.delete(t.id);
        return;
    }
    if (t.bot) t.bot.at = now + wait;
    if (!this.move(t, act)) this.tables.delete(t.id);
  }

  // Requests --------------------------------------------------------------------

  handle(action: string, p: Player, body: Record<string, unknown>): Res | null {
    switch (action) {
      case 'bet':
        return this.bet(p, body);
      case 'mine': {
        const t = this.byPlayer.get(p.id);
        return { ok: true, table: t ? this.pub(t) : null };
      }
      case 'react':
        return this.react(p, body);
      case 'pick':
      case 'open':
      case 'answer':
      case 'swap':
      case 'leave':
        return this.act(action, p, body);
      default:
        return null;
    }
  }

  private bet(p: Player, body: Record<string, unknown>): Res {
    const amount = amountOf(body.amount);
    if (amount === null) return fail('amount');
    if (this.byPlayer.has(p.id) || p.stakes.deal !== undefined) return fail('already', 'You already have a Pizza Boxes round going.');
    if (!this.startLimit.take(p.id)) return fail('rate', 'Easy there. Let the boxes cool off.');
    if (!this.env.store.stake(p, 'deal', amount)) return fail('coins');
    const seed = this.env.newSeed();
    const now = this.env.now();
    const t: Table = {
      id: ++this.counter,
      who: p.id,
      name: p.name,
      emoji: p.emoji,
      real: true,
      bet: amount,
      seed,
      hash: commit(seed),
      round: new DealRound(dealLayoutOf(seed)),
      acts: [],
      startedAt: now,
      lastAt: now,
    };
    this.tables.set(t.id, t);
    this.byPlayer.set(p.id, t);
    const table = this.pub(t);
    this.env.emit('deal.step', { table, events: [] });
    this.env.store.touch();
    this.env.wake();
    return { ok: true, table, events: [], won: 0 };
  }

  private act(action: string, p: Player, body: Record<string, unknown>): Res {
    const t = this.byPlayer.get(p.id);
    if (!t) return fail('not_in', 'You have no Pizza Boxes round going.');
    let a: Act;
    const box = body.box;
    switch (action) {
      case 'pick':
      case 'open':
        if (typeof box !== 'number' || !Number.isInteger(box) || box < 0 || box >= BOXES) return fail('bad_request', 'Pick one of the twenty boxes.');
        a = [action === 'pick' ? 'p' : 'o', box];
        break;
      case 'answer':
        if (typeof body.deal !== 'boolean') return fail('bad_request');
        a = ['a', body.deal ? 1 : 0];
        break;
      case 'swap':
        if (typeof body.swap !== 'boolean') return fail('bad_request');
        a = ['s', body.swap ? 1 : 0];
        break;
      default:
        a = ['l'];
    }
    const done = this.move(t, a);
    if (!done) return fail('bad_request', 'Not now.');
    return { ok: true, table: this.pub(t), events: done.events, won: done.won };
  }

  /** A watcher cheers or groans: one of a few phrases, not often. */
  private react(p: Player, body: Record<string, unknown>): Res {
    const t = typeof body.table === 'number' ? this.tables.get(body.table) : undefined;
    const r = body.r;
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r >= DEAL_REACTS.length) return fail('bad_request', 'Pick one of the phrases.');
    if (!t) return fail('not_found', 'That round is over.');
    if (!this.reactLimit.take(p.id)) return fail('rate', 'Give them a moment.');
    if (!this.tableReactLimit.take(String(t.id))) return fail('rate', 'Everyone is shouting at once.');
    this.env.emit('deal.react', { table: t.id, who: p.id, name: p.name, r });
    return { ok: true };
  }
}
