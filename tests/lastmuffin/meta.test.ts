import { describe, expect, it } from 'vitest';
import { bankRun, bankUnbanked, buyPantry, canUnlock, deserialize, newMeta, pantryCost, pick, serialize, unlock } from '../../games/lastmuffin/src/meta';
import type { RunSummary } from '../../games/lastmuffin/src/run';

const summary = (patch: Partial<RunSummary> = {}): RunSummary => ({ muffin: 'blueberry', seconds: 200, level: 12, kills: 300, crumbs: 40, won: false, bosses: 1, weapons: [], ...patch });

describe('the save', () => {
  it('round-trips', () => {
    const m = newMeta(1000);
    m.crumbs = 123;
    m.pantry.might = 2;
    m.muffins.push('choc');
    m.muffin = 'choc';
    m.best.blueberry = { seconds: 300, level: 14, kills: 900, won: false };
    expect(deserialize(serialize(m))).toEqual(m);
  });
  it('drops junk and caps what is out of range', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"version":2}')).toBeNull();
    const m = deserialize(JSON.stringify({ version: 1, crumbs: -5, pantry: { might: 99, nope: 3 }, muffins: ['choc', 'pizza'], muffin: 'pizza', evolved: ['blaster', 'laser'], sound: false }))!;
    expect(m.crumbs).toBe(0);
    expect(m.pantry.might).toBe(5);
    expect(m.muffins).toEqual(['blueberry', 'choc']);
    expect(m.muffin).toBe('blueberry');
    expect(m.evolved).toEqual(['blaster']);
    expect(m.sound).toBe(false);
  });
});

describe('the Pantry and muffins', () => {
  it('costs more each level and stops at the top', () => {
    const m = newMeta(0);
    m.crumbs = 1000;
    expect(pantryCost(m, 'armor')).toBe(100);
    expect(buyPantry(m, 'armor')).toBe(true);
    expect(pantryCost(m, 'armor')).toBe(250);
    expect(buyPantry(m, 'armor')).toBe(true);
    expect(buyPantry(m, 'armor')).toBe(true);
    expect(pantryCost(m, 'armor')).toBeNull();
    expect(buyPantry(m, 'armor')).toBe(false);
    expect(m.crumbs).toBe(1000 - 850);
  });
  it('unlocks muffins for crumbs, and you can only pick unlocked ones', () => {
    const m = newMeta(0);
    expect(pick(m, 'choc')).toBe(false);
    m.crumbs = 149;
    expect(canUnlock(m, 'choc')).toBe(false);
    m.crumbs = 150;
    expect(unlock(m, 'choc')).toBe(true);
    expect(m.crumbs).toBe(0);
    expect(unlock(m, 'choc')).toBe(false);
    expect(pick(m, 'choc')).toBe(true);
    expect(canUnlock(m, 'double')).toBe(false);
  });
});

describe('after a run', () => {
  it('banks crumbs and records the best run per muffin', () => {
    const m = newMeta(0);
    const b = bankRun(m, summary(), ['ant'], []);
    expect(m.crumbs).toBe(40);
    expect(b.newBest).toBe(true);
    expect(m.runs).toBe(1);
    expect(m.kills).toBe(300);
    expect(m.met).toEqual(['ant']);
    expect(bankRun(m, summary({ seconds: 100 }), ['ant', 'mouse'], []).newBest).toBe(false);
    expect(m.best.blueberry?.seconds).toBe(200);
    expect(m.met).toEqual(['ant', 'mouse']);
  });
  it('a first win unlocks Double Chocolate', () => {
    const m = newMeta(0);
    const b = bankRun(m, summary({ won: true, seconds: 720 }), [], ['blaster']);
    expect(b.unlocked).toEqual(['double']);
    expect(m.muffins).toContain('double');
    expect(m.wins).toBe(1);
    expect(m.evolved).toEqual(['blaster']);
    expect(bankRun(m, summary({ won: true }), [], []).unlocked).toEqual([]);
  });
  it('banks a cut-off run next time', () => {
    const m = newMeta(0);
    m.unbanked = 33;
    expect(bankUnbanked(m)).toBe(33);
    expect(m.crumbs).toBe(33);
    expect(m.unbanked).toBe(0);
  });
});
