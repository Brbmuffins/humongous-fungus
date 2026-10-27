import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared/rng';
import { cents, crashFromHash, crashFromUniform, multiplierAt, newSeed, seal, sha256, timeFor, uniformFromHash, verify } from '../../games/sugarcrash/src/fair';

describe('the climb', () => {
  it('starts at 1×, doubles in about 11.6 s and hits 10× at about 38 s', () => {
    expect(multiplierAt(0)).toBe(1);
    expect(timeFor(2)).toBeCloseTo(11.55, 1);
    expect(timeFor(10)).toBeCloseTo(38.38, 1);
    expect(multiplierAt(timeFor(7.5))).toBeCloseTo(7.5, 9);
  });
  it('rounds multipliers down to the cent', () => {
    expect(cents(2.349)).toBe(2.34);
    expect(cents(1.999999)).toBe(1.99);
    expect(cents(3)).toBe(3);
  });
});

describe('crash points', () => {
  it('follow P(crash ≥ x) = 0.99 / x', () => {
    expect(crashFromUniform(0)).toBe(1);
    expect(crashFromUniform(0.5)).toBe(1.98);
    expect(crashFromUniform(0.9)).toBe(9.9);
    expect(crashFromUniform(0.99)).toBe(99);
    const roll = mulberry32(42);
    const n = 200_000;
    const points = Array.from({ length: n }, () => crashFromUniform(roll()));
    for (const x of [1.01, 1.5, 2, 5, 10, 50]) {
      const share = points.filter((p) => p >= x).length / n;
      expect(share).toBeCloseTo(0.99 / x, 2);
    }
    // About two in a hundred never get off the pad.
    const busts = points.filter((p) => p === 1).length / n;
    expect(busts).toBeGreaterThan(0.015);
    expect(busts).toBeLessThan(0.025);
  });
  it('give the house about 1% at any cash-out target', () => {
    const roll = mulberry32(7);
    const n = 400_000;
    const points = Array.from({ length: n }, () => crashFromUniform(roll()));
    for (const target of [1.2, 2, 3.5]) {
      const back = points.reduce((s, p) => s + (p >= target ? target : 0), 0) / n;
      expect(back).toBeGreaterThan(0.975);
      expect(back).toBeLessThan(1.005);
    }
  });
  it('never go below 1×', () => {
    for (const u of [0, 1e-12, 0.0001, 0.0199, 0.999999999]) expect(crashFromUniform(u)).toBeGreaterThanOrEqual(1);
    expect(crashFromUniform(1)).toBeGreaterThan(1e10);
  });
});

describe('provably fair', () => {
  it('hashes with real SHA-256', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('reads u from the first 52 bits of the hash', () => {
    expect(uniformFromHash('0000000000000' + 'f'.repeat(51))).toBe(0);
    expect(uniformFromHash('8000000000000' + '0'.repeat(51))).toBe(0.5);
    expect(crashFromHash('8000000000000' + '0'.repeat(51))).toBe(1.98);
  });
  it('seals a round from its seed, and anyone can check it', async () => {
    const seed = newSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    const r = await seal(seed);
    expect(r.hash).toBe(await sha256(seed));
    expect(r.crash).toBeGreaterThanOrEqual(1);
    expect(await verify(seed, r.hash, r.crash)).toBe(true);
    // A different crash, hash or seed doesn't check out.
    expect(await verify(seed, r.hash, r.crash + 0.01)).toBe(false);
    expect(await verify(seed, 'f'.repeat(64), r.crash)).toBe(false);
    expect(await verify(newSeed(), r.hash, r.crash)).toBe(false);
  });
  it('the hash you see first gives nothing away: the crash comes from a second hash', async () => {
    const seed = 'a'.repeat(64);
    const r = await seal(seed);
    expect(r.crash).toBe(crashFromHash(await sha256(`${seed}:sugar-crash`)));
    expect(r.hash).not.toBe(await sha256(`${seed}:sugar-crash`));
  });
});
