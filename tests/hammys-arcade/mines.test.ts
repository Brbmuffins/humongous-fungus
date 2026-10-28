import { describe, expect, it } from 'vitest';
import { MINES_DEFAULT, minesMultiplier, tilesOf } from '../../games/hammygotchi/src/mines';
import { floorOf } from '../../games/hammys-arcade/shared/derive';
import { verifySeed } from '../../games/hammys-arcade/shared/fair';
import { MINES_MIN_ROUND_MS, MINES_PAUSE_MS, MINES_ROUND_MS, START_COINS } from '../../games/hammys-arcade/shared/protocol';
import { MinesGame } from '../../games/hammys-arcade/server/mines';
import { world } from './harness';

function setup() {
  const w = world();
  const g = new MinesGame(w.env);
  g.tick();
  const r = w.of('mines.round')[0].round;
  return { w, g, r, seed: w.given[0] };
}

const safeAt = (floor: boolean[], n: number): number[] => floor.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0).slice(0, n);
const poopAt = (floor: boolean[]): number => floor.findIndex(Boolean);

describe('Hammy Mines server: the shared floor', () => {
  it('opens a round with the hash published and about a minute on the clock', () => {
    const { r } = setup();
    expect(r.endsAt - r.startedAt).toBe(MINES_ROUND_MS);
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.seed).toBeUndefined();
  });

  it('gives everyone with the same settings the identical hidden floor, derived from the seed', () => {
    const a = floorOf('ab'.repeat(32), 8, 10);
    expect(floorOf('ab'.repeat(32), 8, 10)).toEqual(a);
    expect(a.filter(Boolean).length).toBe(10);
    expect(floorOf('cd'.repeat(32), 8, 10)).not.toEqual(a);
    expect(floorOf('ab'.repeat(32), 8, 11).filter(Boolean).length).toBe(11);
    expect(floorOf('ab'.repeat(32), 4, 3).length).toBe(16);
    expect(floorOf('ab'.repeat(32), 16, 40).length).toBe(256);
    // Poop count is clamped the game's way.
    expect(floorOf('ab'.repeat(32), 4, 999).filter(Boolean).length).toBe(15);
  });

  it('answers two players with the same settings the same way, box for box', () => {
    const { w, g, seed } = setup();
    const [p, q] = [w.player('Ann'), w.player('Bob')];
    for (const x of [p, q]) expect(g.handle('start', x, { amount: 100, grid: 8, mines: 10 })).toMatchObject({ ok: true, tiles: 64 });
    const floor = floorOf(seed, 8, 10);
    const safe = safeAt(floor, 3);
    for (const i of safe) {
      const [a, b] = [g.handle('open', p, { index: i }), g.handle('open', q, { index: i })];
      expect(a).toMatchObject({ ok: true, safe: true });
      expect(b).toEqual({ ...a, me: undefined, ok: true });
    }
    const bad = poopAt(floor);
    expect(g.handle('open', p, { index: bad })).toMatchObject({ ok: true, safe: false, state: 'hit', poop: bad });
    expect(g.handle('open', q, { index: bad })).toMatchObject({ ok: true, safe: false, state: 'hit', poop: bad });
  });

  it('gives different settings a different floor (no peeking across settings)', () => {
    const { w, g, seed } = setup();
    const p = w.player('Cy');
    g.handle('start', p, { amount: 10, grid: 4, mines: 3 });
    const floor = floorOf(seed, 4, 3);
    expect(g.handle('open', p, { index: poopAt(floor) })).toMatchObject({ safe: false });
  });

  it('keeps the multiplier on the server, the game\'s own, pays on cash out, once', () => {
    const { w, g, seed } = setup();
    const p = w.player('Dee');
    g.handle('start', p, { amount: 400, grid: 8, mines: 10 });
    const floor = floorOf(seed, 8, 10);
    let last: any;
    safeAt(floor, 4).forEach((i, n) => {
      last = g.handle('open', p, { index: i });
      expect(last.mult).toBe(minesMultiplier(8, 10, n + 1));
      expect(last.picks).toBe(n + 1);
    });
    expect(p.coins).toBe(START_COINS - 400);
    expect(g.handle('cash', p, {})).toMatchObject({ ok: true, mult: last.mult, won: Math.floor(400 * last.mult) });
    expect(p.coins).toBe(START_COINS - 400 + Math.floor(400 * last.mult));
    expect(g.handle('cash', p, {})).toMatchObject({ ok: false, error: 'late' });
    expect(g.handle('open', p, { index: 40 })).toMatchObject({ ok: false });
  });

  it('a hit loses the bet; nothing more can be opened', () => {
    const { w, g, seed } = setup();
    const p = w.player('Eve');
    g.handle('start', p, { amount: 250, grid: 8, mines: 10 });
    g.handle('open', p, { index: poopAt(floorOf(seed, 8, 10)) });
    expect(p.coins).toBe(START_COINS - 250);
    expect(p.stakes.mines).toBeUndefined();
    expect(p.stats.arcade.mines).toMatchObject({ rounds: 1, net: -250 });
    expect(g.handle('cash', p, {})).toMatchObject({ ok: false });
  });

  it('refunds a run with nothing opened when cashed out ("take back")', () => {
    const { w, g } = setup();
    const p = w.player('Fay');
    g.handle('start', p, { amount: 250, grid: 8, mines: 10 });
    expect(g.handle('cash', p, {})).toMatchObject({ ok: true, won: 250 });
    expect(p.coins).toBe(START_COINS);
    expect(p.stats.arcade.mines.rounds).toBe(0);
  });

  it('validates: bet, board, poop count, box, one run per floor, repeats', () => {
    const { w, g } = setup();
    const p = w.player('Gus');
    expect(g.handle('start', p, { amount: 0, grid: 8, mines: 10 })).toMatchObject({ error: 'amount' });
    expect(g.handle('start', p, { amount: 10, grid: 9, mines: 10 })).toMatchObject({ error: 'bad_request' });
    expect(g.handle('start', p, { amount: 10, grid: 8, mines: 'many' })).toMatchObject({ error: 'bad_request' });
    expect(g.handle('start', p, { amount: START_COINS + 1, grid: 8, mines: 10 })).toMatchObject({ error: 'coins' });
    expect(g.handle('open', p, { index: 0 })).toMatchObject({ error: 'not_in' });
    expect(g.handle('start', p, { amount: 10, grid: 8, mines: 9999 })).toMatchObject({ ok: true, mines: 63 });
    expect(g.handle('start', p, { amount: 10, grid: 8, mines: 10 })).toMatchObject({ error: 'already' });
    expect(g.handle('open', p, { index: 64 })).toMatchObject({ error: 'bad_request' });
    expect(g.handle('open', p, { index: -1 })).toMatchObject({ error: 'bad_request' });
    expect(g.handle('open', p, { index: 1.5 })).toMatchObject({ error: 'bad_request' });
  });

  it('never tells other players which boxes, only how far (picks, multiplier, state)', () => {
    const { w, g, seed } = setup();
    const p = w.player('Hal');
    g.handle('start', p, { amount: 100, grid: 8, mines: 10 });
    const floor = floorOf(seed, 8, 10);
    const [i] = safeAt(floor, 1);
    g.handle('open', p, { index: i });
    g.handle('open', p, { index: poopAt(floor) });
    for (const e of w.events.filter((e) => e.name.startsWith('mines.'))) {
      expect(Object.keys(e.data)).not.toContain('index');
      expect(Object.keys(e.data)).not.toContain('poop');
      expect(JSON.stringify(e.data)).not.toContain(seed);
    }
    const prog = w.of('mines.progress').filter((e) => e.id === p.id);
    expect(prog[0]).toMatchObject({ picks: 1, state: 'alive', mult: minesMultiplier(8, 10, 1) });
    expect(prog[1]).toMatchObject({ state: 'hit' });
    expect(JSON.stringify(g.snapshot())).not.toContain(seed);
  });

  it('ends the floor on time: open runs cash out at what they have, a run with nothing is given back, the seed is revealed', () => {
    const { w, g, r, seed } = setup();
    const [a, b] = [w.player('Ivy'), w.player('Jon')];
    g.handle('start', a, { amount: 100, grid: 8, mines: 10 });
    g.handle('start', b, { amount: 100, grid: 8, mines: 10 });
    const [i] = safeAt(floorOf(seed, 8, 10), 1);
    g.handle('open', a, { index: i });
    w.advance([g], r.endsAt + MINES_PAUSE_MS);
    const end = w.of('mines.end')[0];
    expect(end.at).toBe(r.endsAt);
    expect(verifySeed(end.seed, r.hash)).toBe(true);
    expect(a.coins).toBe(START_COINS - 100 + Math.floor(100 * minesMultiplier(8, 10, 1)));
    expect(b.coins).toBe(START_COINS);
    expect(b.stats.arcade.mines.rounds).toBe(0);
    expect(end.runners.find((x: any) => x.id === a.id)).toMatchObject({ state: 'cashed', picks: 1 });
    // The next floor opens after the pause, with a new seed.
    expect(w.of('mines.round')[1].round.startedAt).toBe(r.endsAt + MINES_PAUSE_MS);
    expect(w.of('mines.round')[1].round.hash).not.toBe(r.hash);
  });

  it('does not start a run in the last moments of a floor', () => {
    const { w, g, r } = setup();
    g.handle('start', w.player('Early'), { amount: 10, grid: 8, mines: 10 });
    w.advance([g], r.endsAt - 1000);
    expect(g.handle('start', w.player('Kit'), { amount: 10, grid: 8, mines: 10 })).toMatchObject({ error: 'closed' });
  });

  it('may end early once every run is over, but never before the minimum', () => {
    const { w, g, r, seed } = setup();
    // Bots finish quickly; then the floor ends at the minimum time, not the full minute.
    w.advance([g], r.startedAt + 50_000);
    const end = w.of('mines.end')[0];
    expect(end).toBeDefined();
    expect(end.at).toBeGreaterThanOrEqual(r.startedAt + MINES_MIN_ROUND_MS);
    expect(end.at).toBeLessThan(r.endsAt);
    expect(verifySeed(end.seed, r.hash)).toBe(true);
    expect(seed).toBe(end.seed);
  });

  it('plays the made-up cast on the same floor (4 to 7), stepping aside for real players', () => {
    const { w, g, r } = setup();
    expect(r.runners.length).toBeGreaterThanOrEqual(4);
    expect(r.runners.length).toBeLessThanOrEqual(7);
    expect(r.runners.every((x: any) => !x.real)).toBe(true);
    for (let i = 0; i < r.runners.length + 1; i++) g.handle('start', w.player(`Real${i}`), { amount: 10, grid: 8, mines: 10 });
    expect(g.snapshot().round!.runners.some((x) => !x.real)).toBe(false);
  });

  it('the cast opens boxes over time and some hit, some cash out', () => {
    const { w, g, r } = setup();
    w.advance([g], r.startedAt + 30_000);
    const prog = w.of('mines.progress');
    expect(prog.length).toBeGreaterThan(3);
    expect(prog.some((e) => e.state === 'cashed' || e.state === 'hit')).toBe(true);
  });

  it('clearing the whole floor pays at once', () => {
    const { w, g, seed } = setup();
    const p = w.player('Max');
    g.handle('start', p, { amount: 10, grid: 4, mines: 1 });
    const floor = floorOf(seed, 4, 1);
    let res: any;
    for (const i of safeAt(floor, 15)) res = g.handle('open', p, { index: i });
    expect(res).toMatchObject({ state: 'cleared', picks: 15 });
    expect(p.coins).toBe(START_COINS - 10 + Math.floor(10 * minesMultiplier(4, 1, 15)));
    expect(tilesOf(4)).toBe(16);
  });

  it('shutdown gives back coins on a floor that is still on', () => {
    const { w, g } = setup();
    const p = w.player('Zed');
    g.handle('start', p, { amount: 100, grid: 8, mines: MINES_DEFAULT[8] });
    g.shutdown();
    expect(p.coins).toBe(START_COINS);
    expect(p.stakes.mines).toBeUndefined();
  });
});
