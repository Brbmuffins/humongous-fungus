import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRIVIA } from '../../games/hammygotchi/src/trivia/bank';
import { TriviaGame, TriviaLedger } from '../../games/hammys-arcade/server/trivia';
import {
  TRIVIA_CAST,
  TRIVIA_CAST_POOL,
  TRIVIA_CLEAR_BONUS,
  TRIVIA_DAILY_CAP,
  TRIVIA_DECIDE_MS,
  TRIVIA_FLOOR_PRIZE,
  TRIVIA_GRACE_MS,
  TRIVIA_HOUSE_DAILY_CAP,
  TRIVIA_KNOCK_COINS,
  TRIVIA_LADDER,
  TRIVIA_LOBBY_MS,
  TRIVIA_MIN_SHARE,
  TRIVIA_POT_CAP,
  TRIVIA_QUESTION_MS,
  TRIVIA_SHARE_CAP,
  castMember,
} from '../../games/hammys-arcade/shared/trivia';
import { T0, world } from './harness';

const peek = (g: TriviaGame): any => (g as any).round;

/** Run to the moment `pred` holds (looking at every deadline on the way). */
function until(w: ReturnType<typeof world>, g: TriviaGame, pred: () => boolean, limitMs = 600_000): void {
  const end = w.clock.t + limitMs;
  for (let n = 0; n < 5000 && !pred(); n++) {
    const t = g.nextAt();
    if (t === null || t > end) throw new Error('never got there');
    w.clock.t = Math.max(w.clock.t, t);
    g.tick();
  }
  if (!pred()) throw new Error('never got there');
}

const phase = (g: TriviaGame): string | undefined => peek(g)?.phase;
const toPhase = (w: ReturnType<typeof world>, g: TriviaGame, p: string, i?: number): void => until(w, g, () => phase(g) === p && (i === undefined || peek(g).i === i));

/** Answer for a player as shown. */
const answer = (g: TriviaGame, who: any, choice: number) => g.handle('answer', who, { round: peek(g).id, i: peek(g).i, choice });
const right = (g: TriviaGame): number => peek(g).ask.correct;
const wrong = (g: TriviaGame): number => [0, 1, 2].find((k) => k !== right(g))!;

const noBots = { cast: 0 };

describe('The Damp Seat: the lobby and who sits', () => {
  it('opens a lobby when someone is connected, with 80 made-up players', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    g.tick();
    const r = g.snapshot().round!;
    expect(r.phase).toBe('lobby');
    expect(r.cast).toHaveLength(TRIVIA_CAST);
    expect(new Set(r.cast.map((c) => c[0])).size).toBe(TRIVIA_CAST);
    expect(r.phaseAt - r.startedAt).toBe(TRIVIA_LOBBY_MS);
    expect(r.q).toBeNull();
  });

  it('sleeps with nobody connected', () => {
    const w = world({ clients: 0 });
    const g = new TriviaGame(w.env);
    g.tick();
    expect(g.current).toBeNull();
    expect(g.nextAt()).toBeNull();
    w.clients.n = 1;
    g.clientsChanged();
    expect(g.current).not.toBeNull();
  });

  it('seats the first to volunteer, not the first to join', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    const [a, b, c] = ['Ann', 'Bob', 'Cat'].map((n) => w.player(n));
    g.tick();
    g.handle('join', a, {});
    w.clock.t += 100;
    g.handle('volunteer', c, {});
    w.clock.t += 100;
    g.handle('join', b, { hot: true });
    expect(g.snapshot().round!.queue).toEqual(['Cat', 'Bob']);
    toPhase(w, g, 'ask');
    expect(peek(g).hot.player).toBe(c);
    expect(g.snapshot().round!.hot).toMatchObject({ name: 'Cat', real: true });
    expect(peek(g).humans.size).toBe(2);
    expect(g.you(a).role).toBe('crowd');
    expect(g.you(c).role).toBe('hot');
  });

  it('finds a made-up contestant when nobody volunteers, and the round plays itself out', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    const a = w.player('Ann');
    g.tick();
    g.handle('join', a, {});
    toPhase(w, g, 'ask');
    expect(peek(g).hot.player).toBeNull();
    expect(g.snapshot().round!.hot!.real).toBe(false);
    toPhase(w, g, 'end');
    const e = g.snapshot().round!.end!;
    expect(['busted', 'cleared', 'wiped']).toContain(e.outcome);
    // The next round follows.
    toPhase(w, g, 'lobby');
    expect(peek(g).id).toBe(2);
  });

  it('puts a late joiner in the next round, and takes the hand down on request', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    const [a, b] = ['Ann', 'Bob'].map((n) => w.player(n));
    g.tick();
    g.handle('join', a, {});
    toPhase(w, g, 'ask');
    g.handle('join', b, {});
    expect(g.you(b).role).toBe('next');
    expect(answer(g, b, 0)).toMatchObject({ ok: false, error: 'not_in' });
    g.handle('volunteer', b, { on: true });
    expect(g.you(b).volunteer).toBe(true);
    g.handle('volunteer', b, { on: false });
    expect(g.you(b).volunteer).toBe(false);
    expect(g.handle('nonsense', a, {})).toBeNull();
  });

  it('will not let the hot seat walk out', () => {
    const w = world();
    const g = new TriviaGame(w.env, noBots);
    const a = w.player('Ann');
    g.tick();
    g.handle('volunteer', a, {});
    toPhase(w, g, 'ask');
    expect(g.handle('leave', a, {})).toMatchObject({ ok: false, error: 'busy' });
  });
});

describe('The Damp Seat: a question', () => {
  it('never says the right answer, the fact or the source before it closes', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    const [a, b] = ['Ann', 'Bob'].map((n) => w.player(n));
    g.tick();
    g.handle('volunteer', a, {});
    g.handle('join', b, {});
    toPhase(w, g, 'ask');
    const q = TRIVIA.find((x) => x.q === peek(g).ask.text)!;
    const seen = JSON.stringify(g.snapshot()) + JSON.stringify(w.events) + JSON.stringify(g.you(a)) + JSON.stringify(g.you(b));
    expect(seen).not.toContain(q.fact);
    expect(seen).not.toContain(q.source);
    expect(seen).not.toContain('"correct"');
    expect(seen).not.toContain('"fact"');
    // Even a quick check on the wire: the three answers are there, in some order.
    expect([...g.snapshot().round!.q!.answers].sort()).toEqual([...q.answers].sort());
    toPhase(w, g, 'reveal');
    const v = w.of('trivia.reveal').at(-1)!.reveal;
    expect(v.fact).toBe(q.fact);
    expect(v.source).toBe(q.source);
    expect(v.answers[v.correct]).toBe(q.answers[q.correct]);
  });

  it('shuffles the order per round, and the shown right answer is the bank right answer', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    g.tick();
    const spots = new Set<number>();
    const orders = new Set<string>();
    for (let n = 0; n < 12; n++) {
      toPhase(w, g, 'ask', 0);
      const q = TRIVIA.find((x) => x.q === peek(g).ask.text)!;
      expect(peek(g).ask.answers[peek(g).ask.correct]).toBe(q.answers[q.correct]);
      spots.add(peek(g).ask.correct);
      orders.add(peek(g).ask.order.join(''));
      toPhase(w, g, 'lobby');
      w.clock.t = peek(g).phaseAt - 1;
      g.tick();
      toPhase(w, g, 'ask', 0);
      toPhase(w, g, 'lobby');
    }
    expect(spots.size).toBe(3);
    expect(orders.size).toBeGreaterThan(3);
  });

  it('judges by the server clock: in time counts, after the clock plus a short allowance does not', () => {
    const w = world();
    const g = new TriviaGame(w.env, noBots);
    const [a, b] = ['Ann', 'Bob'].map((n) => w.player(n));
    g.tick();
    g.handle('volunteer', a, {});
    g.handle('join', b, {});
    toPhase(w, g, 'ask');
    const closes = peek(g).ask.closesAt;
    expect(closes - peek(g).ask.opensAt).toBe(TRIVIA_QUESTION_MS);
    // Bad input first.
    expect(g.handle('answer', b, { round: peek(g).id, i: peek(g).i, choice: 3 })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(g.handle('answer', b, { round: peek(g).id, i: peek(g).i, choice: '1' })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(g.handle('answer', b, { round: peek(g).id + 1, i: peek(g).i, choice: 1 })).toMatchObject({ ok: false, error: 'late' });
    // In time (the last millisecond before the clock hits zero).
    w.clock.t = closes - 1;
    expect(answer(g, b, 1)).toMatchObject({ ok: true });
    expect(answer(g, b, 2)).toMatchObject({ ok: false, error: 'already' });
    // The hot seat, a hair after zero but inside the allowance.
    w.clock.t = closes + TRIVIA_GRACE_MS - 1;
    expect(answer(g, a, 0)).toMatchObject({ ok: true });
    // Past the allowance nothing is taken.
    const c = w.player('Cat');
    g.handle('join', c, {});
    w.clock.t = closes + TRIVIA_GRACE_MS + 1;
    expect(answer(g, c, 0)).toMatchObject({ ok: false });
  });

  it('closes early when every real player has answered, but not in less than a few seconds', () => {
    const w = world();
    const g = new TriviaGame(w.env, noBots);
    const [a, b] = ['Ann', 'Bob'].map((n) => w.player(n));
    g.tick();
    g.handle('volunteer', a, {});
    g.handle('join', b, {});
    toPhase(w, g, 'ask');
    const opens = peek(g).ask.opensAt;
    answer(g, a, 0);
    expect(w.of('trivia.closing')).toHaveLength(0);
    w.clock.t = opens + 500;
    answer(g, b, 0);
    const c = w.of('trivia.closing')[0];
    expect(c.closesAt).toBe(opens + 4000);
    toPhase(w, g, 'reveal');
    expect(w.clock.t).toBeLessThan(opens + TRIVIA_QUESTION_MS);
  });

  it('keeps a question short when only made-up players are left to wait for', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    g.tick();
    toPhase(w, g, 'ask');
    expect(peek(g).ask.closesAt - peek(g).ask.opensAt).toBe(6000);
  });
});

describe('The Damp Seat: the pot, the prizes and the caps', () => {
  it('knocks out the crowd members who are wrong, and the pot grows by 3 coins x difficulty each', () => {
    const w = world();
    const g = new TriviaGame(w.env, noBots);
    const [a, b, c] = ['Ann', 'Bob', 'Cat'].map((n) => w.player(n));
    g.tick();
    g.handle('volunteer', a, {});
    g.handle('join', b, {});
    g.handle('join', c, {});
    toPhase(w, g, 'ask');
    answer(g, a, right(g));
    answer(g, b, right(g));
    answer(g, c, wrong(g));
    toPhase(w, g, 'reveal');
    const v = w.of('trivia.reveal')[0].reveal;
    expect(v.outHumans).toEqual([c.id]);
    expect(v.potAdd).toBe(1 * TRIVIA_KNOCK_COINS * 1);
    expect(v.pot).toBe(3);
    expect(v.hotOk).toBe(true);
    expect(g.you(c).alive).toBe(false);
    // The out player can't answer the next one.
    toPhase(w, g, 'decide');
    g.handle('go', a, {});
    expect(answer(g, c, 0)).toMatchObject({ ok: false, error: 'out' });
  });

  it('pays the pot to the hot seat who takes it, from the house, and nothing comes from other players', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    const [a, b] = ['Ann', 'Bob'].map((n) => w.player(n));
    const before = { a: a.coins, b: b.coins };
    g.tick();
    g.handle('volunteer', a, {});
    g.handle('join', b, {});
    toPhase(w, g, 'ask');
    answer(g, a, right(g));
    answer(g, b, right(g));
    toPhase(w, g, 'decide');
    const pot = peek(g).pot;
    expect(pot).toBeGreaterThan(0);
    expect(g.handle('take', b, {})).toMatchObject({ ok: false, error: 'not_in' });
    expect(g.handle('take', a, {})).toMatchObject({ ok: true });
    const e = w.of('trivia.end')[0].end;
    expect(e.outcome).toBe('took');
    expect(e.payouts).toEqual([{ id: a.id, name: 'Ann', role: 'hot', due: pot, paid: pot }]);
    expect(a.coins).toBe(before.a + pot);
    expect(b.coins).toBe(before.b);
    expect(g.you(a).earned).toBe(pot);
  });

  it('takes the pot for a hot seat who falls asleep deciding', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    const a = w.player('Ann');
    g.tick();
    g.handle('volunteer', a, {});
    toPhase(w, g, 'ask');
    answer(g, a, right(g));
    toPhase(w, g, 'decide');
    const at = w.clock.t;
    toPhase(w, g, 'end');
    expect(w.clock.t - at).toBe(TRIVIA_DECIDE_MS);
    expect(w.of('trivia.end')[0].end.outcome).toBe('took');
  });

  it('on a wrong answer the hot seat loses the pot and the crowd still standing splits a prize', () => {
    const w = world();
    const g = new TriviaGame(w.env, noBots);
    const [a, b, c] = ['Ann', 'Bob', 'Cat'].map((n) => w.player(n));
    const start = { a: a.coins, b: b.coins, c: c.coins };
    g.tick();
    g.handle('volunteer', a, {});
    g.handle('join', b, {});
    g.handle('join', c, {});
    toPhase(w, g, 'ask');
    answer(g, a, wrong(g));
    answer(g, b, right(g));
    answer(g, c, right(g));
    toPhase(w, g, 'end');
    const e = w.of('trivia.end')[0].end;
    expect(e.outcome).toBe('busted');
    // Two standing: 50 between them is 25 each.
    expect(e.payouts.map((p: any) => p.paid)).toEqual([25, 25]);
    expect(a.coins).toBe(start.a);
    expect(b.coins).toBe(start.b + 25);
    expect(c.coins).toBe(start.c + 25);
  });

  it('pays the crowd between the minimum and maximum share', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    const hot = w.player('Hot');
    const crowd = Array.from({ length: 3 }, (_, i) => w.player(`Fan ${i}`));
    g.tick();
    g.handle('volunteer', hot, {});
    for (const p of crowd) g.handle('join', p, {});
    toPhase(w, g, 'ask');
    answer(g, hot, wrong(g));
    for (const p of crowd) answer(g, p, right(g));
    toPhase(w, g, 'end');
    const e = w.of('trivia.end')[0].end;
    // 80 made-up players and 3 real ones, a few knocked out: the share is the floor.
    expect(e.payouts).toHaveLength(3);
    for (const p of e.payouts) expect(p.paid).toBeGreaterThanOrEqual(TRIVIA_MIN_SHARE);
    for (const p of e.payouts) expect(p.paid).toBeLessThanOrEqual(TRIVIA_SHARE_CAP);
    expect(TRIVIA_FLOOR_PRIZE / 3).toBeLessThanOrEqual(TRIVIA_SHARE_CAP);
  });

  it('pays the clear bonus for climbing the whole ladder, and caps the pot', () => {
    const w = world();
    const g = new TriviaGame(w.env, { cast: 400 });
    const a = w.player('Ann');
    g.tick();
    g.handle('volunteer', a, {});
    for (let i = 0; i < TRIVIA_LADDER.length; i++) {
      toPhase(w, g, 'ask', i);
      expect(peek(g).ask.q.difficulty).toBe(TRIVIA_LADDER[i]);
      answer(g, a, right(g));
      if (i < TRIVIA_LADDER.length - 1) {
        toPhase(w, g, 'decide');
        expect(peek(g).pot).toBeLessThanOrEqual(TRIVIA_POT_CAP);
        g.handle('go', a, {});
      }
    }
    toPhase(w, g, 'end');
    const e = w.of('trivia.end')[0].end;
    // 400 made-up players: some are bound to be standing at the end.
    expect(e.outcome).toBe('cleared');
    expect(e.pot).toBeLessThanOrEqual(TRIVIA_POT_CAP);
    const due = e.payouts[0].due;
    expect(due).toBe(e.pot + (e.outcome === 'cleared' ? TRIVIA_CLEAR_BONUS : 0));
    expect(due).toBeLessThanOrEqual(TRIVIA_POT_CAP + TRIVIA_CLEAR_BONUS);
  });

  it('a wiped-out crowd leaves the hot seat the pot', () => {
    const w = world();
    const g = new TriviaGame(w.env, noBots);
    const a = w.player('Ann');
    g.tick();
    g.handle('volunteer', a, {});
    toPhase(w, g, 'ask');
    answer(g, a, right(g));
    toPhase(w, g, 'end');
    expect(w.of('trivia.end')[0].end.outcome).toBe('wiped');
  });

  it('stops paying a player at the daily cap, and the whole arcade at the house cap', () => {
    const w = world();
    const l = new TriviaLedger(null, () => w.clock.t);
    expect(l.grant('a', 400)).toBe(400);
    expect(l.grant('a', 400)).toBe(TRIVIA_DAILY_CAP - 400);
    expect(l.grant('a', 5)).toBe(0);
    expect(l.earnedToday('a')).toBe(TRIVIA_DAILY_CAP);
    // A new day is a fresh allowance.
    w.clock.t += 24 * 3600_000;
    expect(l.earnedToday('a')).toBe(0);
    expect(l.grant('a', 50)).toBe(50);
    // The house: twenty thousand a day for everyone, however many players come.
    for (let i = 0; l.houseLeft() > 0; i++) l.grant(`p${i}`, TRIVIA_DAILY_CAP);
    expect(l.houseToday()).toBe(TRIVIA_HOUSE_DAILY_CAP);
    expect(l.houseLeft()).toBe(0);
    expect(l.grant('late', 100)).toBe(0);
  });

  it('applies the daily cap in a real round, and says what was due and what was paid', () => {
    const w = world();
    const g = new TriviaGame(w.env, noBots);
    const a = w.player('Ann');
    g.ledger.grant(a.id, TRIVIA_DAILY_CAP - 10);
    g.tick();
    g.handle('volunteer', a, {});
    toPhase(w, g, 'ask');
    const b = w.player('Bob');
    g.handle('join', b, {});
    // Bob joins mid-round: only the next one. Ann answers wrong, nobody to pay; the next round: Ann in the crowd.
    answer(g, a, wrong(g));
    toPhase(w, g, 'lobby');
    g.handle('volunteer', b, {});
    g.handle('join', a, {});
    toPhase(w, g, 'ask');
    const before = a.coins;
    answer(g, b, wrong(g));
    answer(g, a, right(g));
    toPhase(w, g, 'end');
    const p = w.of('trivia.end').at(-1)!.end.payouts[0];
    expect(p.due).toBe(TRIVIA_FLOOR_PRIZE);
    expect(p.paid).toBe(10);
    expect(a.coins).toBe(before + 10);
    expect(g.you(a).earned).toBe(TRIVIA_DAILY_CAP);
    expect(w.store.players.size).toBeGreaterThan(1);
  });

  it('keeps the numbers modest: the best round anyone can have is small next to a wallet of 1000', () => {
    expect(TRIVIA_POT_CAP + TRIVIA_CLEAR_BONUS).toBeLessThanOrEqual(500);
    expect(TRIVIA_DAILY_CAP).toBeLessThanOrEqual(1000);
    expect(TRIVIA_SHARE_CAP).toBeLessThanOrEqual(60);
    expect(TRIVIA_HOUSE_DAILY_CAP / TRIVIA_DAILY_CAP).toBeGreaterThanOrEqual(20);
  });
});

describe('The Damp Seat: the made-up crowd', () => {
  it('has hundreds of different names', () => {
    const names = new Set(Array.from({ length: TRIVIA_CAST_POOL }, (_, i) => castMember(i)[0]));
    expect(names.size).toBe(TRIVIA_CAST_POOL);
    expect(TRIVIA_CAST_POOL).toBeGreaterThanOrEqual(300);
  });

  /** The share of the 80 made-up players who survive the first question, over many rounds, of questions of one difficulty. */
  function survival(d: 1 | 2 | 3, cat: 'general' | 'gross' | null = null, rounds = 25): number {
    const bank = TRIVIA.filter((q) => q.difficulty === d && (!cat || q.cat === cat));
    let total = 0;
    for (let n = 0; n < rounds; n++) {
      const w = world({ seed: () => `${'0'.repeat(60)}${(d * 1000 + n).toString(16).padStart(4, '0')}` });
      const g = new TriviaGame(w.env, { bank });
      g.tick();
      toPhase(w, g, 'reveal');
      const v = w.of('trivia.reveal')[0].reveal;
      total += (TRIVIA_CAST - v.outBots.length) / TRIVIA_CAST;
    }
    return total / rounds;
  }

  it('gets easy questions right more often than medium, and those more often than hard, but never all or none', () => {
    const e = survival(1);
    const m = survival(2);
    const d = survival(3);
    expect(e).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(d);
    expect(e).toBeLessThan(0.95);
    expect(e).toBeGreaterThan(0.7);
    expect(d).toBeGreaterThan(0.33);
    expect(d).toBeLessThan(0.65);
  });

  it('splits on the same wrong answer more than chance, like a real crowd that is fooled', () => {
    let tempted = 0;
    let rounds = 0;
    for (let n = 0; n < 25; n++) {
      const w = world({ seed: () => `${'0'.repeat(60)}${(7000 + n).toString(16).padStart(4, '0')}` });
      const g = new TriviaGame(w.env, { bank: TRIVIA.filter((q) => q.difficulty === 2) });
      g.tick();
      toPhase(w, g, 'reveal');
      const c = w.of('trivia.reveal')[0].reveal;
      const wrongs = c.counts.filter((_: number, i: number) => i !== c.correct).sort((a: number, b: number) => b - a);
      if (wrongs[0] + wrongs[1] > 10) {
        rounds++;
        if (wrongs[0] > wrongs[1] * 1.3) tempted++;
      }
    }
    expect(tempted / rounds).toBeGreaterThan(0.8);
  });

  it('tells the pages how many have answered, a little at a time', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    g.tick();
    toPhase(w, g, 'reveal');
    const t = w.of('trivia.tally');
    expect(t.length).toBeGreaterThan(2);
    for (let i = 1; i < t.length; i++) expect(t[i].answered).toBeGreaterThanOrEqual(t[i - 1].answered);
    expect(t.at(-1).answered).toBeLessThanOrEqual(TRIVIA_CAST);
  });
});

describe('The Damp Seat: which questions', () => {
  it('follows the ladder, never repeats in a round, and mixes both kinds', () => {
    const w = world();
    const g = new TriviaGame(w.env, { cast: 400 });
    const a = w.player('Ann');
    g.tick();
    g.handle('volunteer', a, {});
    const ids: string[] = [];
    for (let i = 0; i < TRIVIA_LADDER.length; i++) {
      toPhase(w, g, 'ask', i);
      ids.push(TRIVIA.find((q) => q.q === peek(g).ask.text)!.id);
      expect(peek(g).ask.q.difficulty).toBe(TRIVIA_LADDER[i]);
      answer(g, a, right(g));
      if (i < TRIVIA_LADDER.length - 1) {
        until(w, g, () => phase(g) === 'decide' || phase(g) === 'end');
        if (phase(g) === 'end') break;
        g.handle('go', a, {});
      }
    }
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(new Set(ids).size).toBe(ids.length);
    // The kinds can't run three of a kind.
    const kinds = ids.map((id) => id.slice(0, 2));
    for (let i = 2; i < kinds.length; i++) expect(kinds[i] === kinds[i - 1] && kinds[i] === kinds[i - 2]).toBe(false);
  });

  it('does not repeat a question for a long while across rounds', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    g.tick();
    const seen: string[] = [];
    // Many rounds of the made-up contestant, each cut short at the first miss.
    for (let n = 0; n < 60; n++) {
      toPhase(w, g, 'lobby');
      toPhase(w, g, 'end');
      w.clock.t = peek(g).phaseAt - 1;
      g.tick();
      for (const e of w.of('trivia.ask').filter((x) => x.round === n + 1)) seen.push(TRIVIA.find((q) => q.q === e.q.text)!.id);
    }
    expect(seen.length).toBeGreaterThan(100);
    let gap = Infinity;
    const last = new Map<string, number>();
    seen.forEach((id, i) => {
      if (last.has(id)) gap = Math.min(gap, i - last.get(id)!);
      last.set(id, i);
    });
    // More than a hundred asked, and none came back within thirty.
    expect(gap).toBeGreaterThan(30);
  }, 60_000);

  it('remembers across a restart: what was asked, and what was won today', () => {
    const dir = mkdtempSync(join(tmpdir(), 'damp-'));
    try {
      const file = join(dir, 'trivia.json');
      const w = world();
      const g = new TriviaGame(w.env, { file });
      const a = w.player('Ann');
      g.tick();
      g.handle('volunteer', a, {});
      toPhase(w, g, 'ask');
      const first = peek(g).ask.text;
      answer(g, a, right(g));
      toPhase(w, g, 'decide');
      g.handle('take', a, {});
      const earned = g.you(a).earned;
      expect(earned).toBeGreaterThan(0);
      g.shutdown();
      const w2 = world();
      w2.clock.t = w.clock.t;
      const g2 = new TriviaGame(w2.env, { file });
      expect(g2.ledger.earnedToday(a.id)).toBe(earned);
      expect(g2.ledger.used.size).toBeGreaterThanOrEqual(1);
      const q = TRIVIA.find((x) => x.q === first)!;
      expect(g2.ledger.used.has(q.id)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('starts fresh from a damaged file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'damp-'));
    try {
      const file = join(dir, 'trivia.json');
      require('node:fs').writeFileSync(file, '{not json');
      const l = new TriviaLedger(file, () => T0);
      l.load();
      expect(l.used.size).toBe(0);
      expect(l.grant('x', 10)).toBe(10);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('The Damp Seat: the clock', () => {
  it('runs faster when told to, all deadlines together', () => {
    const w = world();
    const g = new TriviaGame(w.env, { timeScale: 10 });
    g.tick();
    expect(g.snapshot().round!.phaseAt - g.snapshot().round!.startedAt).toBe(TRIVIA_LOBBY_MS / 10);
  });

  it('runs a whole round without being poked, and each phase begins when the last one was due', () => {
    const w = world();
    const g = new TriviaGame(w.env, noBots);
    g.tick();
    const lobby = peek(g).phaseAt;
    toPhase(w, g, 'ask');
    expect(peek(g).ask.opensAt).toBe(lobby);
    expect(g.nextAt()).not.toBeNull();
  });

  it('stops when everyone has gone', () => {
    const w = world();
    const g = new TriviaGame(w.env);
    g.tick();
    toPhase(w, g, 'end');
    w.clients.n = 0;
    w.clock.t = peek(g).phaseAt;
    g.tick();
    expect(g.current).toBeNull();
  });
});
