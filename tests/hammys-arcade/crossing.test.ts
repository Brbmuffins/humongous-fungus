import { describe, expect, it } from 'vitest';
import { DIFFICULTY_BY_ID, laneMultiplier } from '../../games/hammygotchi/src/crossing';
import { laneRoll, truckOf } from '../../games/hammys-arcade/shared/derive';
import { commit, verifySeed } from '../../games/hammys-arcade/shared/fair';
import { CROSSING_BET_MS, CROSSING_LANE_MS, CROSSING_PAUSE_MS, START_COINS } from '../../games/hammys-arcade/shared/protocol';
import { CrossingGame } from '../../games/hammys-arcade/server/crossing';
import { seedsWhere, world } from './harness';

const ROADS = ['easy', 'medium', 'hard', 'daredevil'] as const;

/** A world where the first round's lane 1 roll is in [lo, hi), and the rest is whatever. */
function lane1(lo: number, hi: number) {
  const w = world({ seed: seedsWhere((s) => laneRoll(s, 1) >= lo && laneRoll(s, 1) < hi) });
  const g = new CrossingGame(w.env);
  g.tick();
  const r = w.of('crossing.betting')[0].round;
  return { w, g, r, goAt: r.goAt as number };
}

describe('Hammy Crossing server: the shared road', () => {
  it('opens with the hash published, a 10 second betting window, and lanes on a shared clock', () => {
    const { r } = lane1(0, 1);
    expect(r.goAt - r.startedAt).toBe(CROSSING_BET_MS);
    expect(r.laneMs).toBe(CROSSING_LANE_MS);
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.seed).toBeUndefined();
  });

  it('draws ONE roll per lane for everyone: each is flattened only if the roll is under their own risk', () => {
    // 0.12 <= u < 0.2: Easy and Medium make it, Hard and Daredevil are flattened.
    const { w, g, goAt } = lane1(0.12, 0.2);
    const ps = ROADS.map((d) => ({ d, p: w.player(`P-${d}`) }));
    for (const { d, p } of ps) expect(g.handle('bet', p, { amount: 100, difficulty: d })?.ok).toBe(true);
    w.advance([g], goAt);
    for (const { p } of ps) expect(g.handle('go', p, { lane: 1 })?.ok).toBe(true);
    w.advance([g], goAt + CROSSING_LANE_MS);
    const lane = w.of('crossing.lane')[0];
    expect(lane.lane).toBe(1);
    expect(lane.at).toBe(goAt + CROSSING_LANE_MS);
    const by = Object.fromEntries(lane.results.map((r: any) => [r.id, r]));
    expect(by[ps[0].p.id]).toMatchObject({ state: 'alive', lane: 1, mult: laneMultiplier('easy', 1) });
    expect(by[ps[1].p.id]).toMatchObject({ state: 'alive', lane: 1, mult: laneMultiplier('medium', 1) });
    expect(by[ps[2].p.id].state).toBe('flat');
    expect(by[ps[3].p.id].state).toBe('flat');
    // One roll, one truck, for the whole lane; the seed derives both.
    expect(typeof lane.u).toBe('number');
    expect(lane.u).toBeGreaterThanOrEqual(0.12);
    expect(lane.u).toBeLessThan(0.2);
    expect(ps[2].p.coins).toBe(START_COINS - 100);
    expect(ps[2].p.stakes.crossing).toBeUndefined();
    expect(ps[0].p.stakes.crossing).toBe(100);
  });

  it('a very bad roll flattens everyone, a very good one nobody, and the risks are the game\'s own', () => {
    expect(ROADS.map((d) => DIFFICULTY_BY_ID[d].risk)).toEqual([0.04, 0.12, 0.2, 0.4]);
    for (const [lo, hi, flat] of [[0, 0.04, 4], [0.4, 1, 0]] as const) {
      const { w, g, goAt } = lane1(lo, hi);
      const ps = ROADS.map((d) => w.player(`Q${d}`));
      ps.forEach((p, i) => g.handle('bet', p, { amount: 10, difficulty: ROADS[i] }));
      w.advance([g], goAt);
      for (const p of ps) g.handle('go', p, { lane: 1 });
      w.advance([g], goAt + CROSSING_LANE_MS);
      const mine = new Set(ps.map((p) => p.id));
      expect(w.of('crossing.lane')[0].results.filter((r: any) => mine.has(r.id) && r.state === 'flat').length).toBe(flat);
    }
  });

  it('standing still cashes you out at what you have: the safe default', () => {
    const { w, g, goAt } = lane1(0.5, 1);
    const p = w.player('Napper');
    g.handle('bet', p, { amount: 100, difficulty: 'easy' });
    w.advance([g], goAt + CROSSING_LANE_MS);
    // Never said Go for lane 1: cashed at 1x, the bet comes back.
    expect(w.of('crossing.lane')[0].results.find((r: any) => r.id === p.id)).toMatchObject({ state: 'cashed', lane: 0, mult: 1 });
    expect(p.coins).toBe(START_COINS);
    expect(p.stakes.crossing).toBeUndefined();
  });

  it('pays the lane multiplier when you cash out after a lane, and cash out is allowed any time in between', () => {
    const { w, g, goAt } = lane1(0.5, 1);
    const p = w.player('Careful');
    g.handle('bet', p, { amount: 1000, difficulty: 'hard' });
    expect(g.handle('go', p, { lane: 1 })).toMatchObject({ ok: false });
    w.advance([g], goAt);
    expect(g.handle('go', p, { lane: 2 })).toMatchObject({ ok: false, error: 'late' });
    expect(g.handle('go', p, { lane: 1 })?.ok).toBe(true);
    w.advance([g], goAt + CROSSING_LANE_MS);
    expect(g.handle('cash', p, {})).toMatchObject({ ok: true, lane: 1, mult: laneMultiplier('hard', 1) });
    expect(p.coins).toBe(START_COINS - 1000 + Math.floor(1000 * laneMultiplier('hard', 1)));
    expect(g.handle('cash', p, {})).toMatchObject({ ok: false });
    expect(w.of('crossing.cash')[0]).toMatchObject({ id: p.id, lane: 1 });
  });

  it('refuses a go after the road has decided that lane', () => {
    const { w, g, goAt } = lane1(0.5, 1);
    const p = w.player('Slow');
    g.handle('bet', p, { amount: 10, difficulty: 'easy' });
    w.advance([g], goAt + CROSSING_LANE_MS - 1);
    expect(g.handle('go', p, { lane: 1 })?.ok).toBe(true);
    w.clock.t = goAt + CROSSING_LANE_MS;
    expect(g.handle('go', p, { lane: 1 })).toMatchObject({ ok: false });
  });

  it('crossing every lane pays out on its own, at the road\'s multiplier', () => {
    const lanes = DIFFICULTY_BY_ID.easy.lanes;
    const w = world({ seed: seedsWhere((s) => Array.from({ length: lanes }, (_, i) => laneRoll(s, i + 1)).every((u) => u >= 0.04)) });
    const g = new CrossingGame(w.env);
    g.tick();
    const goAt = w.of('crossing.betting')[0].round.goAt;
    const p = w.player('Runner');
    g.handle('bet', p, { amount: 1000, difficulty: 'easy' });
    w.advance([g], goAt);
    for (let k = 1; k <= lanes; k++) {
      expect(g.handle('go', p, { lane: k })?.ok).toBe(true);
      w.advance([g], goAt + k * CROSSING_LANE_MS);
    }
    const last = w.of('crossing.lane')[lanes - 1].results.find((r: any) => r.id === p.id);
    expect(last).toMatchObject({ state: 'done', lane: lanes, mult: laneMultiplier('easy', lanes) });
    expect(p.coins).toBe(START_COINS - 1000 + Math.floor(1000 * laneMultiplier('easy', lanes)));
    expect(p.stats.arcade.crossing.best).toBe(laneMultiplier('easy', lanes));
  });

  it('ends once no real crosser is left, reveals the seed, and every lane\'s roll and truck derive from it', () => {
    const { w, g, goAt } = lane1(0, 0.04);
    const p = w.player('Flat');
    g.handle('bet', p, { amount: 10, difficulty: 'easy' });
    w.advance([g], goAt);
    g.handle('go', p, { lane: 1 });
    w.advance([g], goAt + 60_000);
    const end = w.of('crossing.end')[0];
    expect(verifySeed(end.seed, end.hash)).toBe(true);
    expect(commit(end.seed)).toBe(end.hash);
    for (const l of w.of('crossing.lane').filter((e) => e.round === end.round)) {
      expect(l.u).toBe(laneRoll(end.seed, l.lane));
      expect(l.truck).toBe(truckOf(end.seed, l.lane));
    }
    expect(end.at).toBe(goAt + CROSSING_LANE_MS + 1500);
    // The next road opens after the pause.
    expect(w.of('crossing.betting')[1].round.startedAt).toBe(end.at + CROSSING_PAUSE_MS);
  });

  it('validates bets: a road, a whole-coin amount you have, one per round, only while betting', () => {
    const { w, g, goAt } = lane1(0, 1);
    const p = w.player('Picky');
    expect(g.handle('bet', p, { amount: 10 })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(g.handle('bet', p, { amount: 10, difficulty: 'nightmare' })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(g.handle('bet', p, { amount: 10, difficulty: '__proto__' })).toMatchObject({ ok: false });
    expect(g.handle('bet', p, { amount: 0.5, difficulty: 'easy' })).toMatchObject({ ok: false, error: 'amount' });
    expect(g.handle('bet', p, { amount: START_COINS + 1, difficulty: 'easy' })).toMatchObject({ ok: false, error: 'coins' });
    expect(g.handle('bet', p, { amount: 10, difficulty: 'easy' })?.ok).toBe(true);
    expect(g.handle('bet', p, { amount: 10, difficulty: 'easy' })).toMatchObject({ ok: false, error: 'already' });
    expect(g.handle('unbet', p, {})?.ok).toBe(true);
    expect(p.coins).toBe(START_COINS);
    g.handle('bet', p, { amount: 10, difficulty: 'easy' });
    w.advance([g], goAt);
    expect(g.handle('unbet', p, {})).toMatchObject({ ok: false });
    expect(g.handle('bet', w.player('Late'), { amount: 10, difficulty: 'easy' })).toMatchObject({ ok: false, error: 'closed' });
  });

  it('fills with a made-up cast (4 to 7 in all) that crosses on the same road and steps aside for real players', () => {
    const { w, g, r } = lane1(0, 1);
    const cast = r.crossers.length;
    expect(cast).toBeGreaterThanOrEqual(4);
    expect(cast).toBeLessThanOrEqual(7);
    for (let i = 0; i < cast + 1; i++) {
      g.handle('bet', w.player(`Real${i}`), { amount: 10, difficulty: 'medium' });
      expect(g.snapshot().round!.crossers.length).toBe(Math.max(cast, i + 1));
    }
    expect(g.snapshot().round!.crossers.some((c) => !c.real)).toBe(false);
  });

  it('a road of only the cast still runs to the end for anyone watching', () => {
    const { w, g, goAt } = lane1(0, 1);
    w.advance([g], goAt + 200_000);
    expect(w.of('crossing.end').length).toBeGreaterThan(0);
  });

  it('shutdown gives back coins on a road that is still on', () => {
    const { w, g } = lane1(0, 1);
    const p = w.player('Cut');
    g.handle('bet', p, { amount: 300, difficulty: 'daredevil' });
    g.shutdown();
    expect(p.coins).toBe(START_COINS);
    expect(p.stats.arcade.crossing.rounds).toBe(0);
  });

  it('pays back about 99% for someone who goes for a fixed number of lanes (the road is fair)', () => {
    const w = world();
    const g = new CrossingGame(w.env);
    const p = w.player('Whale');
    p.coins = 1e12;
    g.tick();
    let wagered = 0;
    for (let i = 0; i < 3000; i++) {
      let r = g.snapshot().round!;
      while (r.phase !== 'bet') {
        w.advance([g], w.clock.t + 1000);
        r = g.snapshot().round!;
      }
      g.handle('bet', p, { amount: 1000, difficulty: 'hard' });
      wagered += 1000;
      w.advance([g], r.goAt);
      for (let k = 1; k <= 3; k++) {
        g.handle('go', p, { lane: k });
        w.advance([g], r.goAt + k * CROSSING_LANE_MS);
      }
      // After three lanes, standing still cashes out.
      w.advance([g], r.goAt + 4 * CROSSING_LANE_MS);
      w.advance([g], w.clock.t + CROSSING_PAUSE_MS + 3000);
    }
    const back = (p.coins - 1e12 + wagered) / wagered;
    expect(back).toBeGreaterThan(0.93);
    expect(back).toBeLessThan(1.05);
  });
});
