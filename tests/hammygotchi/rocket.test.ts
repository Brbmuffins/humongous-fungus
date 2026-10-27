import { describe, expect, it } from 'vitest';
import { CRASHES, ROCKET_CROWD, cashCrowd, crashCause, crashPoint, crowd, multiplierAt, secondsTo } from '../../games/hammygotchi/src/rocket';

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
