import { describe, expect, it } from 'vitest';
import { ARCADE, ARCADE_IN_APPS, HOME_LINES, RTP, payOut, placeBet, refundBet } from '../../games/hammygotchi/src/arcade';
import { DIFFICULTIES, crossLane, laneMultiplier } from '../../games/hammygotchi/src/crossing';
import { MINES_CAP, MINES_DEFAULT, MINES_GRIDS, clampMines, layMines, minesMultiplier, tilesOf } from '../../games/hammygotchi/src/mines';
import { PLINKO_RISKS, PLINKO_ROWS, binOdds, binOf, dropPath, plinkoReturn, plinkoTable } from '../../games/hammygotchi/src/plinko';
import { deserialize, newGame, serialize } from '../../games/hammygotchi/src/state';

const T0 = Date.UTC(2026, 9, 1, 12);

/** A repeatable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** n choose k, as a float. */
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

describe('Hammy’s Arcade: your coins', () => {
  it('takes the bet up front and pays it back times the multiplier, game by game', () => {
    const s = newGame(T0);
    s.coins = 100;
    expect(placeBet(s, 'mines', 30.7)).toBe(true);
    expect(s.coins).toBe(70);
    expect(payOut(s, 'mines', 30, 2.37)).toBe(71);
    expect(s.coins).toBe(141);
    expect(s.stats.arcade.mines).toEqual({ rounds: 1, net: 41, best: 2.37 });
    expect(s.stats.arcade.rocket).toEqual({ rounds: 0, net: 0, best: 0 });
    // A Plinko drop can pay back less than it cost.
    placeBet(s, 'plinko', 10);
    expect(payOut(s, 'plinko', 10, 0.29)).toBe(2);
    expect(s.stats.arcade.plinko.net).toBe(-8);
  });

  it('won’t bet what you don’t have, nothing, or on a dead Hammy', () => {
    const s = newGame(T0);
    s.coins = 20;
    expect(placeBet(s, 'rocket', 21)).toBe(false);
    expect(placeBet(s, 'rocket', 0)).toBe(false);
    expect(placeBet(s, 'rocket', Number.NaN)).toBe(false);
    expect(s.coins).toBe(20);
    s.diedAt = T0;
    expect(placeBet(s, 'crossing', 5)).toBe(false);
    expect(s.stats.arcade.crossing.rounds).toBe(0);
  });

  it('gives a bet back if it never got going, as if it never happened', () => {
    const s = newGame(T0);
    s.coins = 50;
    placeBet(s, 'crossing', 25);
    refundBet(s, 'crossing', 25);
    expect(s.coins).toBe(50);
    expect(s.stats.arcade.crossing).toEqual({ rounds: 0, net: 0, best: 0 });
  });

  it('keeps a losing record through a save, and picks up Fart Rocket’s old stats', () => {
    const s = newGame(T0);
    s.coins = 40;
    placeBet(s, 'plinko', 40);
    const back = deserialize(serialize(s))!;
    expect(back.stats.arcade.plinko).toEqual({ rounds: 1, net: -40, best: 0 });
    const old = JSON.parse(serialize(s));
    delete old.stats.arcade;
    Object.assign(old.stats, { rocketRounds: 3, rocketNet: -12, rocketBest: 4.2 });
    const migrated = deserialize(JSON.stringify(old))!;
    expect(migrated.stats.arcade.rocket).toEqual({ rounds: 3, net: -12, best: 4.2 });
    expect(migrated.stats.arcade.mines).toEqual({ rounds: 0, net: 0, best: 0 });
  });

  it('has something to say after every game, and stays out of the store apps', () => {
    for (const g of ARCADE) {
      const home = HOME_LINES[g.id];
      expect(home.won.length && home.lost.length && home.even.length).toBeTruthy();
    }
    expect(ARCADE_IN_APPS).toBe(false);
  });
});

describe('Hammy Mines', () => {
  it('comes in 4×4, 8×8 and 16×16, each with a sensible amount of poop', () => {
    expect(MINES_GRIDS.map(tilesOf)).toEqual([16, 64, 256]);
    for (const g of MINES_GRIDS) {
      expect(clampMines(g, 0)).toBe(1);
      expect(clampMines(g, 9999)).toBe(tilesOf(g) - 1);
      expect(clampMines(g, MINES_DEFAULT[g])).toBe(MINES_DEFAULT[g]);
    }
  });

  it('hides exactly the poop you asked for, somewhere different each time', () => {
    const roll = seeded(5);
    const seen = new Set<string>();
    for (const g of MINES_GRIDS) {
      for (let i = 0; i < 20; i++) {
        const board = layMines(g, MINES_DEFAULT[g], roll);
        expect(board.length).toBe(tilesOf(g));
        expect(board.filter(Boolean).length).toBe(MINES_DEFAULT[g]);
        seen.add(board.map(Number).join(''));
      }
    }
    expect(seen.size).toBe(60);
  });

  it('pays the fair odds of each run, less 1%', () => {
    for (const g of MINES_GRIDS) {
      const n = tilesOf(g);
      for (const mines of [1, MINES_DEFAULT[g], Math.floor(n / 2)]) {
        expect(minesMultiplier(g, mines, 0)).toBe(1);
        for (const picks of [1, 2, 5]) {
          const survive = choose(n - mines, picks) / choose(n, picks);
          const m = minesMultiplier(g, mines, picks);
          if (m >= MINES_CAP) continue;
          // Paid at the multiplier when you get that far: back about 99%.
          expect(survive * m).toBeLessThanOrEqual(RTP + 1e-9);
          expect(survive * m).toBeGreaterThan(RTP - 0.01 * survive - 1e-9);
        }
      }
    }
    expect(minesMultiplier(4, 3, 1)).toBe(1.21);
    expect(minesMultiplier(4, 15, 1)).toBe(15.84);
  });

  it('climbs with every Dorkito and caps the impossible runs', () => {
    let prev = 1;
    for (let k = 1; k <= 64 - 10; k++) {
      const m = minesMultiplier(8, 10, k);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
    expect(minesMultiplier(16, 128, 128)).toBe(MINES_CAP);
    expect(minesMultiplier(16, 255, 1)).toBe(253.44);
  });
});

describe('Hammy Crossing', () => {
  it('pays the fair odds of making it that far, less 1%, on every road', () => {
    for (const d of DIFFICULTIES) {
      expect(laneMultiplier(d.id, 0)).toBe(1);
      let prev = 1;
      for (let k = 1; k <= d.lanes; k++) {
        const m = laneMultiplier(d.id, k);
        expect(m).toBeGreaterThan(prev);
        prev = m;
        // Rounding the multiplier down costs at most a hundredth of it.
        const odds = (1 - d.risk) ** k;
        expect(odds * m).toBeLessThanOrEqual(RTP + 1e-9);
        expect(odds * m).toBeGreaterThan(RTP - 0.01 * odds - 1e-9);
      }
      // No lanes past the other side.
      expect(laneMultiplier(d.id, d.lanes + 5)).toBe(laneMultiplier(d.id, d.lanes));
    }
    expect(laneMultiplier('daredevil', 1)).toBe(1.65);
  });

  it('gets him about as often as the road says', () => {
    const roll = seeded(9);
    for (const d of DIFFICULTIES) {
      let hit = 0;
      for (let i = 0; i < 20_000; i++) if (!crossLane(d.id, roll)) hit++;
      expect(hit / 20_000).toBeCloseTo(d.risk, 1);
    }
  });
});

describe('Poop Plinko', () => {
  it('has a toilet for every way down, the same on both sides', () => {
    for (const rows of PLINKO_ROWS) {
      const odds = binOdds(rows);
      expect(odds.length).toBe(rows + 1);
      expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      for (const risk of PLINKO_RISKS) {
        const t = plinkoTable(rows, risk);
        expect(t.length).toBe(rows + 1);
        expect(t).toEqual([...t].reverse());
        // Edges pay most, the middle least.
        expect(t[0]).toBe(Math.max(...t));
        expect(t[rows / 2]).toBe(Math.min(...t));
      }
    }
  });

  it('pays back just under 99% on every board', () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        const back = plinkoReturn(rows, risk);
        expect(back).toBeLessThanOrEqual(RTP);
        expect(back).toBeGreaterThan(0.985);
      }
    }
  });

  it('bounces fairly: drops land where the odds say', () => {
    const roll = seeded(13);
    const counts = new Array(9).fill(0);
    const n = 40_000;
    for (let i = 0; i < n; i++) counts[binOf(dropPath(8, roll))]++;
    binOdds(8).forEach((p, i) => expect(counts[i] / n).toBeCloseTo(p, 2));
  });
});
