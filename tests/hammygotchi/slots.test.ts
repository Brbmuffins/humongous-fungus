import { describe, expect, it } from 'vitest';
import { ARCADE, ARCADE_BY_ID, ARCADE_IN_APPS, HOME_LINES, RTP, noBets } from '../../games/hammygotchi/src/arcade';
import {
  LINES,
  LINE_COUNT,
  MAX_UNITS,
  MAX_WIN,
  ORB_EFFECTS,
  ORB_HITS,
  ORB_TRIGGER,
  REELS,
  ROWS,
  STRIPS,
  SYMBOLS,
  applyEffect,
  cellsOf,
  gridOf,
  isNearMiss,
  lineWins,
  orbsIn,
  payMultiplier,
  pickEffect,
  runOf,
  scoreCells,
  spin,
  tierOf,
  type Roll,
  type SlotSymbol,
} from '../../games/hammygotchi/src/slots';
import { analyse, orbOdds } from '../../games/hammygotchi/src/slotsmath';
import { Wallet } from '../../games/hammys-arcade/src/wallet';
import type { LocalSave } from '../../shared/storage';

/** A repeatable stand-in for the browser's random numbers. */
function seeded(seed: number): Roll {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

const IX = (id: SlotSymbol): number => SYMBOLS.findIndex((s) => s.id === id);
const payOf = (id: SlotSymbol, count: number): number => SYMBOLS[IX(id)].pays![count - 3];

/** Cells for a grid given as the five symbols along one row (the other rows hold dorkitos, which can't line up). */
function row1(...ids: SlotSymbol[]): Uint8Array {
  const cells = new Uint8Array(REELS * ROWS).fill(IX('orb'));
  ids.forEach((id, r) => (cells[r * ROWS + 1] = IX(id)));
  return cells;
}
const middle = LINES.findIndex((l) => l.rows.every((r) => r === 1));
const cellsOfLine = (i: number): number[] => LINES[i].rows.map((row, reel) => reel * ROWS + row);

describe('Hammy Slots: the paylines', () => {
  it('are valid shapes: one row on every reel, none repeated', () => {
    const seen = new Set<string>();
    for (const l of LINES) {
      expect(l.rows.length).toBe(REELS);
      for (const r of l.rows) expect(Number.isInteger(r) && r >= 0 && r < ROWS).toBe(true);
      seen.add(l.rows.join(','));
    }
    expect(seen.size).toBe(LINES.length);
    expect(LINE_COUNT).toBe(LINES.length);
  });

  it('include every straight row and some real zig-zags', () => {
    for (let row = 0; row < ROWS; row++) expect(LINES.some((l) => l.rows.every((r) => r === row))).toBe(true);
    const turns = (rows: readonly number[]) => rows.slice(2).filter((r, i) => Math.sign(r - rows[i + 1]) * Math.sign(rows[i + 1] - rows[i]) < 0).length;
    // A V (down then up) and a peak (up then down), and something with several turns.
    expect(LINES.some((l) => l.rows[0] < l.rows[2] && l.rows[2] > l.rows[4])).toBe(true);
    expect(LINES.some((l) => l.rows[0] > l.rows[2] && l.rows[2] < l.rows[4])).toBe(true);
    expect(LINES.some((l) => turns(l.rows) >= 2)).toBe(true);
  });

  it('have reels that only hold known symbols, with no wild leading a line', () => {
    expect(STRIPS.length).toBe(REELS);
    const chars = new Set(SYMBOLS.map((s) => s.ch));
    for (const s of STRIPS) for (const ch of s) expect(chars.has(ch)).toBe(true);
    expect(STRIPS[0].includes(SYMBOLS[IX('wild')].ch)).toBe(false);
    expect(STRIPS[0].includes(SYMBOLS[IX('orb')].ch)).toBe(false);
  });
});

describe('Hammy Slots: what a line pays', () => {
  const [A, B] = SYMBOLS.filter((s) => s.pays).map((s) => s.id);
  const run = (...ids: SlotSymbol[]) => runOf(row1(...ids), cellsOfLine(middle));

  it('needs 3 or more matching symbols, counting from the left', () => {
    expect(run(A, A, A, B, B).pay).toBe(payOf(A, 3));
    expect(run(A, A, A, A, B).pay).toBe(payOf(A, 4));
    expect(run(A, A, A, A, A).pay).toBe(payOf(A, 5));
    expect(run(A, A, B, A, A).pay).toBe(0);
    expect(run(B, A, A, A, A).pay).toBe(0);
    expect(run(A, B, A, A, A).pay).toBe(0);
  });

  it('lets the wild stand in for anything but the orb', () => {
    expect(run(A, 'wild', A, B, B)).toMatchObject({ count: 3, pay: payOf(A, 3) });
    expect(run(A, A, 'wild', 'wild', B)).toMatchObject({ count: 4, pay: payOf(A, 4) });
    expect(run(A, 'wild', B, A, A).pay).toBe(0);
    // Starting on a wild, the line is whatever comes first after it.
    expect(run('wild', B, B, A, A)).toMatchObject({ symbol: IX(B), count: 3 });
    // The orb is no substitute, and it breaks the line.
    expect(run(A, A, 'orb', A, A).pay).toBe(0);
  });

  it('pays a line of nothing but wilds as the best symbol', () => {
    const top = SYMBOLS.filter((s) => s.pays).at(-1)!;
    expect(run('wild', 'wild', 'wild', 'wild', 'wild')).toMatchObject({ symbol: IX(top.id), count: 5, pay: top.pays![2] });
  });

  it('adds up every winning line, and agrees with the fast score', () => {
    const roll = seeded(3);
    for (let i = 0; i < 3000; i++) {
      const stops = STRIPS.map((s) => Math.floor(roll() * s.length));
      const wins = lineWins(stops);
      expect(wins.reduce((s, w) => s + w.units, 0)).toBe(scoreCells(cellsOf(stops)));
      const grid = gridOf(stops);
      for (const w of wins) {
        expect(w.count).toBeGreaterThanOrEqual(3);
        expect(w.cells.length).toBe(w.count);
        w.cells.forEach(([reel, row], k) => {
          expect(row).toBe(LINES[w.line].rows[reel]);
          expect(reel).toBe(k);
          expect(['wild', w.symbol]).toContain(grid[reel][row]);
        });
        expect(w.mult).toBeCloseTo(w.units / LINE_COUNT, 12);
      }
    }
  });

  it('shows each reel’s three symbols from its stop, wrapping round the strip', () => {
    STRIPS.forEach((strip, reel) => {
      const stops = STRIPS.map(() => 0);
      stops[reel] = strip.length - 1;
      const col = gridOf(stops)[reel].map((id) => SYMBOLS[IX(id)].ch);
      expect(col.join('')).toBe(strip[strip.length - 1] + strip.slice(0, ROWS - 1));
    });
  });
});

describe('Hammy Slots: the multiplier orb', () => {
  it('adds or multiplies, and never goes past the top win', () => {
    for (const e of ORB_EFFECTS) {
      const to = applyEffect(100, e);
      expect(to).toBe(e.op === 'add' ? 100 + Math.round(e.value * LINE_COUNT) : 100 * e.value);
      expect(applyEffect(MAX_UNITS, e)).toBe(MAX_UNITS);
      expect(applyEffect(MAX_UNITS - 1, e)).toBeLessThanOrEqual(MAX_UNITS);
    }
    expect(applyEffect(0, { op: 'mul', value: 5 })).toBe(0);
    expect(MAX_UNITS).toBe(MAX_WIN * LINE_COUNT);
  });

  it('picks effects by their weights, from the first to the last', () => {
    expect(pickEffect(0)).toBe(ORB_EFFECTS[0]);
    expect(pickEffect(0.999999999)).toBe(ORB_EFFECTS[ORB_EFFECTS.length - 1]);
    const roll = seeded(11);
    const seen = new Set(Array.from({ length: 4000 }, () => pickEffect(roll())));
    expect(seen.size).toBe(ORB_EFFECTS.length);
  });

  it('goes off with the orbs you landed, a ball each, and plays the bounces on the line win', () => {
    // Stops that put an orb on two reels.
    const orbCh = SYMBOLS[IX('orb')].ch;
    const stops = STRIPS.map((s) => Math.max(0, s.indexOf(orbCh)));
    const need = REELS - 1;
    const have = stops.filter((st, r) => STRIPS[r][st] === orbCh).length;
    expect(have).toBeGreaterThanOrEqual(ORB_TRIGGER);
    expect(need).toBeGreaterThan(0);
    // Every roll after the stops is 0.99 (no sneeze); then the first effect, each time.
    const seq = [...stops.map((st, r) => (st + 0.5) / STRIPS[r].length), 0.99];
    let i = 0;
    const roll: Roll = () => (i < seq.length ? seq[i++] : 0);
    const s = spin(roll);
    const orbs = orbsIn(cellsOf(s.stops));
    expect(s.orbs).toBe(orbs);
    expect(orbs).toBeGreaterThanOrEqual(ORB_TRIGGER);
    expect(s.sneeze).toBe(false);
    expect(s.feature).not.toBeNull();
    expect(s.feature!.balls.length).toBe(orbs);
    // The first effect in the table, ORB_HITS times for each ball.
    const first = ORB_EFFECTS[0];
    let units = s.lines * LINE_COUNT;
    for (const ball of s.feature!.balls) {
      expect(ball.hits.length).toBe(ORB_HITS);
      for (const hit of ball.hits) {
        units = applyEffect(units, first);
        expect(hit).toMatchObject({ op: first.op, value: first.value });
        expect(hit.after).toBeCloseTo(units / LINE_COUNT, 9);
      }
    }
    expect(s.units).toBe(units);
    expect(s.mult).toBeCloseTo(units / LINE_COUNT, 9);
  });

  it('keeps its promises on every spin: bounces stay on the grid, effects chain, nothing goes past the cap', () => {
    const roll = seeded(5);
    let features = 0;
    let sneezes = 0;
    for (let n = 0; n < 40_000; n++) {
      const s = spin(roll);
      expect(s.mult).toBeLessThanOrEqual(MAX_WIN);
      expect(s.units).toBeLessThanOrEqual(MAX_UNITS);
      expect(s.units).toBe(Math.round(s.mult * LINE_COUNT));
      expect(isNearMiss(s)).toBe(s.orbs === 1 && !s.feature && s.units === 0);
      const sneezed = s.sneeze && s.orbs < ORB_TRIGGER;
      expect(!!s.feature).toBe(s.orbs >= ORB_TRIGGER || sneezed);
      if (!s.feature) {
        expect(s.mult).toBeCloseTo(s.lines, 9);
        continue;
      }
      features++;
      if (sneezed) sneezes++;
      expect(s.feature.balls.length).toBe(s.orbs + (sneezed ? 1 : 0));
      expect(s.feature.base).toBeCloseTo(s.lines, 9);
      let units = Math.min(MAX_UNITS, Math.round(s.lines * LINE_COUNT));
      for (const ball of s.feature.balls) {
        expect(ball.from === null).toBe(ball === s.feature.balls[s.feature.balls.length - 1] && sneezed);
        let at = ball.from;
        for (const hit of ball.hits) {
          expect(hit.reel).toBeGreaterThanOrEqual(0);
          expect(hit.reel).toBeLessThan(REELS);
          expect(hit.row).toBeGreaterThanOrEqual(0);
          expect(hit.row).toBeLessThan(ROWS);
          if (at) {
            // A bounce moves one cell, diagonally.
            expect(Math.abs(hit.reel - at.reel)).toBe(1);
            expect(Math.abs(hit.row - at.row)).toBe(1);
          }
          at = hit;
          units = applyEffect(units, hit);
          expect(Math.round(hit.after * LINE_COUNT)).toBe(units);
        }
      }
      expect(s.units).toBe(units);
    }
    expect(features).toBeGreaterThan(300);
    expect(sneezes).toBeGreaterThan(0);
  });

  it('agrees with its own odds: simulated bounces average what the exact sum says', () => {
    const roll = seeded(21);
    for (const balls of [1, 2]) {
      const odds = orbOdds(balls);
      expect(odds.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 9);
      for (const start of [0, 6 * LINE_COUNT]) {
        const exact = odds.reduce((s, o) => s + o.p * Math.min(MAX_UNITS, o.a * start + o.b), 0);
        let sum = 0;
        const N = 120_000;
        for (let n = 0; n < N; n++) {
          let u = start;
          for (let k = 0; k < balls * ORB_HITS; k++) u = applyEffect(u, pickEffect(roll()));
          sum += u;
        }
        expect(Math.abs(sum / N - exact) / exact).toBeLessThan(0.03);
      }
    }
  });
});

describe('Hammy Slots: the payback', () => {
  // Every combination of stops is walked, so this is exact. A few seconds.
  const a = analyse();

  it('pays back 0.99 of every coin bet, to within half a percent, worked out exactly', () => {
    expect(a.combos).toBe(STRIPS.reduce((n, s) => n * s.length, 1));
    expect(a.rtp).toBeGreaterThan(RTP - 0.005);
    expect(a.rtp).toBeLessThan(RTP + 0.005);
    expect(a.rtpLines + a.rtpOrb).toBeCloseTo(a.rtp, 9);
  }, 120_000);

  it('hits often enough to be fun, with the orb and the top win rare', () => {
    expect(a.hit).toBeGreaterThan(a.hitBet);
    expect(a.hit).toBeGreaterThan(0.2);
    // Swingy: most wins are at least the bet back, and a spin's spread is wide.
    expect(a.hitBet).toBeGreaterThan(0.2);
    expect(a.sd).toBeGreaterThan(8);
    expect(a.orb).toBeGreaterThan(0.02);
    expect(a.orb).toBeLessThan(0.15);
    expect(a.maxWin).toBe(MAX_WIN);
    expect(a.capChance).toBeLessThan(1e-4);
  }, 120_000);

  it('matches a seeded simulation of the real spins', () => {
    const roll = seeded(77);
    const N = 200_000;
    let sum = 0;
    let hit = 0;
    let orb = 0;
    for (let i = 0; i < N; i++) {
      const s = spin(roll);
      sum += s.mult;
      if (s.mult > 0) hit++;
      if (s.feature) orb++;
    }
    // The exact figures are the proof; this checks the spin function plays them.
    expect(Math.abs(hit / N - a.hit)).toBeLessThan(0.01);
    expect(Math.abs(orb / N - a.orb)).toBeLessThan(0.004);
    expect(Math.abs(sum / N - a.rtp)).toBeLessThan(0.12);
  }, 120_000);
});

describe('Hammy Slots: how loud a win is', () => {
  it('is no win under the bet, then escalates by tier', () => {
    expect(tierOf(0)).toBeNull();
    expect(tierOf(0.95)).toBeNull();
    expect(tierOf(1)?.label).toBe('WIN');
    expect(tierOf(9.99)?.label).toBe('WIN');
    expect(tierOf(10)?.label).toBe('BIG WIN');
    expect(tierOf(50)?.label).toBe('HUGE WIN');
    expect(tierOf(250)?.label).toBe('HAMMY WIN');
    expect(tierOf(MAX_WIN)?.label).toBe('HAMMY WIN');
  });
});

describe('Hammy Slots: coins', () => {
  function memory(): LocalSave & { raw: string | null } {
    const slot = { raw: null as string | null, load: () => slot.raw, save: (raw: string) => void (slot.raw = raw), clear: () => void (slot.raw = null) };
    return slot;
  }

  it('is in the arcade, with a card, a colour and something to say afterwards', () => {
    const def = ARCADE_BY_ID.slots;
    expect(def.name && def.emoji && def.blurb && def.color).toBeTruthy();
    expect(ARCADE.some((g) => g.id === 'slots')).toBe(true);
    const home = HOME_LINES.slots;
    expect(home.won.length && home.lost.length && home.even.length).toBeTruthy();
    expect(noBets().slots).toEqual({ rounds: 0, net: 0, best: 0 });
    expect(ARCADE_IN_APPS).toBe(false);
  });

  it('pays whole coins, rounded down, exactly, whatever the bet and the win', () => {
    for (const bet of [1, 3, 7, 10, 20, 25, 99, 100, 333, 1000, 12345]) {
      for (let units = 0; units <= 600; units++) {
        const want = Math.floor((bet * units) / LINE_COUNT);
        expect(Math.floor(bet * payMultiplier(bet, units))).toBe(want);
      }
    }
  });

  it('bets and settles through the wallet, with the stats', () => {
    const w = new Wallet(memory(), 'cube');
    const roll = seeded(9);
    let rounds = 0;
    let net = 0;
    let best = 0;
    for (let i = 0; i < 400; i++) {
      const bet = 20;
      // Keep it in coins; the stats carry on.
      w.state.coins = Math.max(w.coins, 1000);
      const before = w.coins;
      expect(w.bet('slots', bet)).toBe(true);
      const s = spin(roll);
      const won = w.payOut('slots', bet, payMultiplier(bet, s.units));
      expect(won).toBe(Math.floor((bet * s.units) / LINE_COUNT));
      expect(w.coins).toBe(before - bet + won);
      rounds++;
      net += won - bet;
      if (s.mult > 0) best = Math.max(best, Math.floor(s.mult * 100) / 100);
    }
    expect(w.state.stats.arcade.slots).toEqual({ rounds, net, best });
    expect(w.state.stats.arcade.rocket.rounds).toBe(0);
    // A bet you can't cover is turned down.
    w.state.coins = 5;
    expect(w.bet('slots', 6)).toBe(false);
  });
});
