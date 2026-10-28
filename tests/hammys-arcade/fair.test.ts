import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { commit, fromHex, isSeed, rollAt, sha256, stream, toHex, verifySeed } from '../../games/hammys-arcade/shared/fair';
import { SILLY_NAMES, blocked, checkName } from '../../games/hammys-arcade/shared/names';

describe('fair: the page and the server hash the same way', () => {
  it('sha256 matches node:crypto, on every length around the block edges', () => {
    for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const b = randomBytes(n);
      expect(toHex(sha256(b))).toBe(createHash('sha256').update(b).digest('hex'));
    }
    expect(toHex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('commit is the hash of the seed bytes, and verifySeed checks it', () => {
    const seed = randomBytes(32).toString('hex');
    expect(isSeed(seed)).toBe(true);
    expect(commit(seed)).toBe(createHash('sha256').update(Buffer.from(seed, 'hex')).digest('hex'));
    expect(verifySeed(seed, commit(seed))).toBe(true);
    expect(verifySeed(seed, commit('00'.repeat(32)))).toBe(false);
    expect(verifySeed('nope', commit(seed))).toBe(false);
    expect(toHex(fromHex(seed))).toBe(seed);
  });

  it('rolls are deterministic, in [0, 1), and independent by label and index', () => {
    const seed = 'ab'.repeat(32);
    expect(rollAt(seed, 'crash', 0)).toBe(rollAt(seed, 'crash', 0));
    expect(rollAt(seed, 'crash', 0)).not.toBe(rollAt(seed, 'crash', 1));
    expect(rollAt(seed, 'crash', 0)).not.toBe(rollAt(seed, 'lane', 0));
    const next = stream(seed, 'x');
    expect([next(), next()]).toEqual([rollAt(seed, 'x', 0), rollAt(seed, 'x', 1)]);
    const rolls = Array.from({ length: 4000 }, (_, i) => rollAt(seed, 'spread', i));
    expect(rolls.every((r) => r >= 0 && r < 1)).toBe(true);
    const mean = rolls.reduce((a, b) => a + b, 0) / rolls.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
    // The roll is the first 48 bits of the hash of "label:i:seed".
    const d = createHash('sha256').update(`crash:0:${seed}`).digest();
    expect(rollAt(seed, 'crash', 0)).toBe(d.readUIntBE(0, 6) / 2 ** 48);
  });
});

describe('names', () => {
  it('trims, squashes spaces, and enforces 2 to 16 of letters, digits, space, _ and -', () => {
    expect(checkName('  Hammy   Fan ')).toEqual({ ok: true, name: 'Hammy Fan' });
    expect(checkName('a')).toEqual({ ok: false, error: 'name_length' });
    expect(checkName('x'.repeat(17))).toEqual({ ok: false, error: 'name_length' });
    expect(checkName('x'.repeat(16)).ok).toBe(true);
    expect(checkName('nice_name-2')).toEqual({ ok: true, name: 'nice_name-2' });
    expect(checkName('<b>hi</b>')).toEqual({ ok: false, error: 'name_chars' });
    expect(checkName('Ünï')).toEqual({ ok: false, error: 'name_chars' });
    expect(checkName(42)).toEqual({ ok: false, error: 'name_length' });
  });

  it('blocks slurs, even in look-alike spelling, but not innocent words', () => {
    const rot = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
    expect(blocked(rot('avttre'))).toBe(true);
    expect(blocked(rot('snttbg').toUpperCase())).toBe(true);
    expect(checkName(`x ${rot('xvxr')} x`)).toEqual({ ok: false, error: 'name_blocked' });
    expect(blocked('Raccoon Rick')).toBe(false);
    expect(blocked('Spicy Pete')).toBe(false);
    expect(blocked('Scunthorpe')).toBe(false);
  });

  it('every silly name is a valid name', () => {
    for (const n of SILLY_NAMES) expect(checkName(n)).toEqual({ ok: true, name: n });
  });
});
