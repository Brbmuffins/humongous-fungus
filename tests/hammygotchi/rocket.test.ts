import { describe, expect, it } from 'vitest';
import {
  CRASHES,
  ROCKET_CROWD,
  ROCKET_IN_APPS,
  cashCrowd,
  crashCause,
  crashPoint,
  crowd,
  multiplierAt,
  rocketBet,
  rocketCashOut,
  rocketRefund,
  secondsTo,
} from '../../games/hammygotchi/src/rocket';
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

/** Evenly spread rolls, so the odds come out exactly rather than roughly. */
const GRID = Array.from({ length: 100_000 }, (_, i) => (i + 0.5) / 100_000);

describe('Fart Rocket: the climb and the crash', () => {
  it('starts at 1× and climbs, and secondsTo undoes multiplierAt', () => {
    expect(multiplierAt(0)).toBe(1);
    expect(multiplierAt(-5)).toBe(1);
    expect(multiplierAt(10)).toBeGreaterThan(2);
    expect(multiplierAt(10)).toBeLessThan(2.2);
    for (const m of [1.5, 2, 10, 100]) expect(multiplierAt(secondsTo(m))).toBeCloseTo(m, 9);
  });

  it('crashes at 1× about 2 rounds in 100, never below 1×, and caps out', () => {
    expect(crashPoint(0)).toBe(1);
    expect(crashPoint(0.5)).toBe(1.98);
    expect(crashPoint(0.999999999)).toBeLessThanOrEqual(10_000);
    const instant = GRID.filter((u) => crashPoint(u) <= 1).length / GRID.length;
    expect(instant).toBeGreaterThan(0.015);
    expect(instant).toBeLessThan(0.025);
    expect(GRID.every((u) => crashPoint(u) >= 1)).toBe(true);
  });

  it('gets past x with odds 0.99 / x, so every cash-out target pays back 99%', () => {
    for (const target of [1.5, 2, 5, 10, 50]) {
      const past = GRID.filter((u) => crashPoint(u) > target).length / GRID.length;
      expect(past).toBeCloseTo(0.99 / target, 2);
      expect(past * target).toBeGreaterThan(0.975);
      expect(past * target).toBeLessThan(1);
    }
  });

  it('ends each flight with something he could have reached', () => {
    const roll = seeded(7);
    for (const crash of [1, 1.3, 2, 2.7, 9.5, 24, 60, 400]) {
      for (let i = 0; i < 40; i++) expect(crashCause(crash, roll).from).toBeLessThanOrEqual(crash);
    }
    expect(crashCause(1, () => 0).id).toBe('gas');
    const high = new Set(Array.from({ length: 200 }, () => crashCause(60, roll).id));
    expect(high.has('ohio')).toBe(true);
    expect(high.has('gas')).toBe(false);
    expect(new Set(CRASHES.map((c) => c.id)).size).toBe(CRASHES.length);
  });
});

describe('Fart Rocket: everyone else', () => {
  it('brings four to seven of them, each once, with bets', () => {
    const roll = seeded(3);
    for (let i = 0; i < 50; i++) {
      const ps = crowd(roll);
      expect(ps.length).toBeGreaterThanOrEqual(4);
      expect(ps.length).toBeLessThanOrEqual(7);
      expect(new Set(ps.map((p) => p.name)).size).toBe(ps.length);
      for (const p of ps) {
        expect(p.bet).toBeGreaterThan(0);
        expect(p.out).toBeNull();
        expect(p.target === null).toBe(p.style === 'never');
      }
    }
    expect(ROCKET_CROWD.find((p) => p.name === 'The Plant')?.style).toBe('never');
  });

  it('lets them out once their nerve goes, and only before the crash', () => {
    const ps = crowd(seeded(11)).map((p, i) => ({ ...p, target: p.target === null ? null : 1.5 + i }));
    const early = cashCrowd(ps, 2.6, 4);
    expect(early.map((p) => p.target)).toEqual(ps.filter((p) => p.target !== null && p.target <= 2.6).map((p) => p.target));
    for (const p of early) expect(p.out).toBe(Math.floor(p.target! * 100) / 100);
    expect(cashCrowd(ps, 2.6, 4)).toEqual([]);
    const late = cashCrowd(ps, 100, 4);
    for (const p of late) expect(p.target!).toBeLessThan(4);
    for (const p of ps) if (p.target === null || p.target >= 4) expect(p.out).toBeNull();
  });
});

describe('Fart Rocket: your coins', () => {
  it('takes the bet up front and pays it back times the multiplier', () => {
    const s = newGame(T0);
    s.coins = 100;
    expect(rocketBet(s, 30.7)).toBe(true);
    expect(s.coins).toBe(70);
    expect(rocketCashOut(s, 30, 2.37)).toBe(71);
    expect(s.coins).toBe(141);
    expect(s.stats.rocketRounds).toBe(1);
    expect(s.stats.rocketNet).toBe(41);
    expect(s.stats.rocketBest).toBe(2.37);
  });

  it('won’t bet what you don’t have, nothing, or on a dead Hammy', () => {
    const s = newGame(T0);
    s.coins = 20;
    expect(rocketBet(s, 21)).toBe(false);
    expect(rocketBet(s, 0)).toBe(false);
    expect(rocketBet(s, Number.NaN)).toBe(false);
    expect(s.coins).toBe(20);
    s.diedAt = T0;
    expect(rocketBet(s, 5)).toBe(false);
    expect(s.stats.rocketRounds).toBe(0);
  });

  it('gives a bet back if it never launched, as if it never happened', () => {
    const s = newGame(T0);
    s.coins = 50;
    rocketBet(s, 25);
    rocketRefund(s, 25);
    expect(s.coins).toBe(50);
    expect(s.stats.rocketRounds).toBe(0);
    expect(s.stats.rocketNet).toBe(0);
  });

  it('keeps a losing record through a save, and old saves start at zero', () => {
    const s = newGame(T0);
    s.coins = 40;
    rocketBet(s, 40);
    const back = deserialize(serialize(s))!;
    expect(back.stats.rocketNet).toBe(-40);
    expect(back.stats.rocketRounds).toBe(1);
    const old = JSON.parse(serialize(s));
    delete old.stats.rocketRounds;
    delete old.stats.rocketNet;
    delete old.stats.rocketBest;
    const fresh = deserialize(JSON.stringify(old))!;
    expect(fresh.stats.rocketRounds).toBe(0);
    expect(fresh.stats.rocketNet).toBe(0);
    expect(fresh.stats.rocketBest).toBe(0);
  });

  it('stays out of the store apps unless switched on (it would change their age rating)', () => {
    expect(ROCKET_IN_APPS).toBe(false);
  });
});
