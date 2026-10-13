import { describe, expect, it } from 'vitest';
import { deserialize, newGame, pickBest, serialize } from '../../games/fungus/src/game/state';

describe('saves', () => {
  it('round-trips', () => {
    const s = newGame(1000, 5);
    s.nutrients = 123.5;
    s.producers.hyphae = 3;
    s.upgrades.push('enzymes');
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('rejects garbage', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('null')).toBeNull();
    expect(deserialize('{"version":99}')).toBeNull();
  });
  it('drops unknown or malformed fields', () => {
    const raw = JSON.stringify({
      version: 1,
      nutrients: -5,
      jarTotal: 'lots',
      producers: { hyphae: 4.7, dragon: 9 },
      upgrades: ['enzymes', 'made-up', 'enzymes', 3],
      cultivating: { id: 'nope', startedAt: 1, endsAt: 2 },
    });
    const s = deserialize(raw)!;
    expect(s.nutrients).toBe(0);
    expect(s.jarTotal).toBe(0);
    expect(s.producers).toEqual({ hyphae: 4 });
    expect(s.upgrades).toEqual(['enzymes']);
    expect(s.cultivating).toBeNull();
  });
  it('prefers the save with the most progress', () => {
    const a = newGame(0, 1);
    const b = newGame(0, 2);
    a.lifetime = 10;
    b.lifetime = 500;
    b.updatedAt = -1;
    expect(pickBest([a, b])).toBe(b);
    expect(pickBest([])).toBeNull();
  });
});
