import { describe, expect, it } from 'vitest';
import { HOP, MAX_LEVEL, PULSE_SECONDS, RUN_SECONDS, SLOTS, WEAPON_BY_ID, clockText, levelText, xpToNext, type EnemyId } from '../../games/lastmuffin/src/defs';
import { Run, type Enemy, type Input } from '../../games/lastmuffin/src/run';

const still: Input = { x: 0, y: 0, hop: false };
const run = (patch: Partial<ConstructorParameters<typeof Run>[0]> = {}) => new Run({ muffin: 'blueberry', pantry: {}, seed: 7, ...patch });

/** Step for `seconds` at 60 fps, picking the first offer at every level-up. */
function play(r: Run, seconds: number, input: Input = still): void {
  for (let i = 0; i < seconds * 60; i++) {
    r.step(1 / 60, input);
    if (r.state === 'levelup') r.choose(0);
    if (r.state === 'chest') r.closeChest();
  }
}

/** Put a pest somewhere, bypassing the spawner. */
function place(r: Run, id: EnemyId, x: number, y: number): Enemy {
  return (r as unknown as { addEnemy(id: string, x: number, y: number): Enemy }).addEnemy(id, x, y);
}

describe('defs', () => {
  it('needs 5 sprinkles for level 2, then 7 more each level, then more', () => {
    expect(xpToNext(1)).toBe(5);
    expect(xpToNext(2)).toBe(12);
    expect(xpToNext(19)).toBe(131);
    expect(xpToNext(20)).toBe(139);
    expect(xpToNext(21)).toBe(149);
    expect(xpToNext(41)).toBe(352);
  });
  it('describes each weapon level in words', () => {
    expect(levelText(WEAPON_BY_ID.blaster, 1)).toBe('+1 blueberry');
    expect(levelText(WEAPON_BY_ID.blaster, 3)).toBe('+1 blueberry, faster');
    expect(levelText(WEAPON_BY_ID.knives, 4)).toBe('+5 damage, +25% size');
    expect(levelText(WEAPON_BY_ID.blaster, 0)).toBe(WEAPON_BY_ID.blaster.blurb);
  });
  it('every weapon has five levels that only get better', () => {
    for (const w of Object.values(WEAPON_BY_ID)) {
      expect(w.levels).toHaveLength(MAX_LEVEL);
      for (let i = 1; i < MAX_LEVEL; i++) {
        const a = w.levels[i - 1];
        const b = w.levels[i];
        expect(b.damage).toBeGreaterThanOrEqual(a.damage);
        expect(b.cooldown).toBeLessThanOrEqual(a.cooldown);
        expect(b.count).toBeGreaterThanOrEqual(a.count);
        expect(levelText(w, i)).not.toBe('');
      }
    }
  });
  it('runs the clock from midnight to 6 AM', () => {
    expect(clockText(0)).toBe('12:00 AM');
    expect(clockText(60)).toBe('12:30 AM');
    expect(clockText(RUN_SECONDS)).toBe('6:00 AM');
  });
});

describe('a run', () => {
  it('starts with the muffin’s own weapon', () => {
    expect(run().weapons.map((w) => w.id)).toEqual(['blaster']);
    expect(run({ muffin: 'bran' }).weapons.map((w) => w.id)).toEqual(['coffee']);
    const d = run({ muffin: 'double' });
    expect(d.weapons[0].id).toBe('whisk');
    expect(d.passiveLevel('bonk')).toBe(1);
  });
  it('applies muffin perks and the Pantry', () => {
    expect(run({ muffin: 'bran' }).stats.maxHp).toBe(150);
    expect(run({ pantry: { health: 3 } }).stats.maxHp).toBe(130);
    expect(run({ pantry: { might: 2 } }).stats.might).toBeCloseTo(1.1);
    // Out-of-range Pantry levels are capped.
    expect(run({ pantry: { armor: 99 } }).stats.armor).toBe(3);
    expect(run({ pantry: { reroll: 2, revive: 1 } }).rerolls).toBe(2);
  });
  it('is the same every time with the same seed', () => {
    const a = run();
    const b = run();
    play(a, 40, { x: 0.3, y: -1, hop: false });
    play(b, 40, { x: 0.3, y: -1, hop: false });
    expect(a.kills).toBe(b.kills);
    expect(a.x).toBe(b.x);
    expect(a.enemies.length).toBe(b.enemies.length);
  });
  it('spawns pests off screen, more as the night goes on, up to a cap', () => {
    const r = run();
    // The night opens with a handful already on their way.
    r.step(1 / 60, still);
    expect(r.enemies.length).toBeGreaterThanOrEqual(10);
    // Off the screen: past its left or right edge, or its top or bottom.
    for (const e of r.enemies) expect(Math.abs(e.x - r.x) > r.view.w / 2 || Math.abs(e.y - r.y) > r.view.h / 2).toBe(true);
    r.revives = 99;
    r.hp = 1e9;
    play(r, 50);
    expect(r.enemies.length).toBeLessThanOrEqual(70 + 40);
  });
  it('blueberries kill ants, which drop sprinkles that level you up', () => {
    const r = run();
    for (let i = 0; i < 5; i++) place(r, 'ant', 100 + i * 25, 0);
    for (let i = 0; i < 400 && r.kills < 5; i++) r.step(1 / 60, still);
    expect(r.kills).toBe(5);
    expect(r.weapons[0].kills).toBe(5);
    expect(r.weapons[0].damage).toBeGreaterThan(0);
    // One sprinkle each: some already picked up (they come to you when close).
    const floor = r.pickups.filter((p) => p.kind === 'xp').reduce((n, p) => n + p.value, 0);
    expect(floor + r.xp + (r.level - 1) * 5).toBe(5);
    // Walk over them.
    for (let i = 0; i < 120 && r.state === 'playing'; i++) r.step(1 / 60, { x: 1, y: 0, hop: false });
    expect(r.state).toBe('levelup');
    expect(r.level).toBe(2);
    expect(r.offers).toHaveLength(3);
  });
  it('picking an offer applies it; rerolls and skips are limited', () => {
    const r = run({ pantry: { reroll: 1 } });
    r.addXp(5);
    r.step(1 / 60, still);
    expect(r.state).toBe('levelup');
    expect(r.reroll()).toBe(true);
    expect(r.reroll()).toBe(false);
    const o = r.offers[0];
    r.choose(0);
    expect(r.state).toBe('playing');
    if (o.type === 'weapon') expect(r.weapons.find((w) => w.id === o.id)?.level).toBe(o.level);
    if (o.type === 'passive') expect(r.passiveLevel(o.id)).toBe(o.level);
  });
  it('queues several level-ups at once', () => {
    const r = run();
    r.addXp(5 + 12 + 19);
    expect(r.level).toBe(4);
    r.step(1 / 60, still);
    r.choose(0);
    expect(r.state).toBe('levelup');
    r.skip();
    r.choose(1);
    expect(r.state).toBe('playing');
    expect(r.levelUps).toBe(0);
  });
  it('carries at most five weapons and five passives', () => {
    const r = run();
    for (let i = 0; i < 200; i++) {
      r.addXp(xpToNext(r.level));
      r.step(1 / 60, still);
      while (r.state === 'levelup') r.choose(0);
    }
    expect(r.weapons.length).toBeLessThanOrEqual(SLOTS);
    expect(r.passives.length).toBeLessThanOrEqual(SLOTS);
    for (const w of r.weapons) expect(w.level).toBeLessThanOrEqual(MAX_LEVEL);
    // Everything maxed: snacks and milk.
    r.addXp(xpToNext(r.level));
    r.step(1 / 60, still);
    expect(r.offers.map((o) => o.type)).toEqual(['snack', 'milk']);
  });
  it('pests hurt on contact, armor takes some off, and never below 1', () => {
    const r = run();
    place(r, 'raccoon', 0, 0);
    r.step(1 / 60, still);
    expect(r.hp).toBe(100 - 18);
    const armored = run({ pantry: { armor: 3 } });
    place(armored, 'ant', 0, 0);
    armored.step(1 / 60, still);
    expect(armored.hp).toBe(100 - 2);
    const tough = run();
    tough.stats.armor = 50;
    place(tough, 'ant', 0, 0);
    tough.step(1 / 60, still);
    expect(tough.hp).toBe(99);
  });
  it('a hop moves you and keeps you safe for a moment', () => {
    const r = run();
    r.step(1 / 60, { x: 1, y: 0, hop: true });
    for (let i = 0; i < 12; i++) r.step(1 / 60, { x: 1, y: 0, hop: false });
    expect(r.x).toBeGreaterThan(HOP.distance * 0.9);
    place(r, 'raccoon', r.x, r.y);
    r.step(1 / 60, still);
    expect(r.hp).toBe(100);
    // Not again right away.
    const x = r.x;
    r.step(1 / 60, { x: 1, y: 0, hop: true });
    expect(r.x - x).toBeLessThan(5);
  });
  it('dies at zero health, unless the Pantry bought a revive', () => {
    const r = run();
    r.hp = 5;
    place(r, 'raccoon', 0, 0);
    r.step(1 / 60, still);
    expect(r.state).toBe('dead');
    const s = r.summary(100);
    expect(s.won).toBe(false);
    const saved = run({ pantry: { revive: 1 } });
    saved.hp = 5;
    place(saved, 'raccoon', 0, 0);
    saved.step(1 / 60, still);
    expect(saved.state).toBe('playing');
    expect(saved.hp).toBe(50);
    expect(saved.revives).toBe(0);
  });
  it('wins at sunrise, and can keep going', () => {
    const r = run();
    r.t = RUN_SECONDS - 0.01;
    (r as unknown as { nextEvent: number }).nextEvent = 99;
    r.step(1 / 30, still);
    expect(r.state).toBe('won');
    expect(r.summary(100).won).toBe(true);
    expect(r.banked(100)).toBe(100);
    r.keepGoing();
    expect(r.state).toBe('playing');
    expect(r.hpScale()).toBeGreaterThan(2.1);
  });
  it('bosses drop a pie tin that evolves a maxed weapon with its passive', () => {
    const r = run();
    r.weapons[0].level = MAX_LEVEL;
    r.passives.push({ id: 'yeast', level: 1 });
    const boss = place(r, 'queen', 60, 0);
    boss.hp = 1;
    for (let i = 0; i < 120 && r.bosses === 0; i++) r.step(1 / 60, still);
    expect(r.bosses).toBe(1);
    expect(r.pickups.some((p) => p.kind === 'chest')).toBe(true);
    for (let i = 0; i < 200 && r.state === 'playing'; i++) r.step(1 / 60, { x: 1, y: 0, hop: false });
    expect(r.state).toBe('chest');
    expect(r.chest?.evolved).toBe('blaster');
    expect(r.weapons[0].evolved).toBe(true);
    expect(r.crumbs).toBeGreaterThanOrEqual(40);
    r.closeChest();
    expect(r.state).not.toBe('chest');
    // Evolved weapons don't come up as upgrades any more.
    expect(r.makeOffers(20).some((o) => o.type === 'weapon' && o.id === 'blaster')).toBe(false);
  });
  it('without an evolution, a pie tin levels up what you have', () => {
    const r = run();
    const before = r.weapons[0].level;
    (r as unknown as { take(p: object): void }).take({ kind: 'chest', x: 0, y: 0, value: 1, pulled: false });
    expect(r.state).toBe('chest');
    expect(r.chest?.evolved).toBeNull();
    expect(r.chest!.upgrades.length).toBeGreaterThan(0);
    expect(r.weapons[0].level).toBeGreaterThan(before);
  });
  it('mold splits into little molds', () => {
    const r = run();
    const m = place(r, 'mold', 70, 0);
    m.hp = 1;
    for (let i = 0; i < 120 && r.kills === 0; i++) r.step(1 / 60, still);
    expect(r.enemies.filter((e) => e.def.id === 'moldling')).toHaveLength(3);
  });
  it('every weapon kind hurts pests around you', () => {
    for (const id of Object.keys(WEAPON_BY_ID) as (keyof typeof WEAPON_BY_ID)[]) {
      const r = run();
      r.weapons = [{ id, level: 3, evolved: false, readyAt: 0, angle: 0, damage: 0, kills: 0 }];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const e = place(r, 'raccoon', Math.cos(a) * 60, Math.sin(a) * 60);
        e.hp = e.maxHp = 1e6;
      }
      r.hp = 1e9;
      play(r, 4);
      expect(r.weapons[0].damage, id).toBeGreaterThan(0);
    }
  });
  it('gets tougher with time', () => {
    const r = run();
    expect(r.hpScale()).toBe(1);
    r.t = 600;
    expect(r.hpScale()).toBeCloseTo(2.8);
  });
});

describe('automation', () => {
  const sprinkle = (r: Run, x: number, y: number, value = 1) => r.pickups.push({ kind: 'xp', x, y, value, pulled: false });

  it('Sous Chef helpers fetch sprinkles you are nowhere near', () => {
    const r = run();
    sprinkle(r, 200, 0);
    play(r, 3);
    expect(r.xp).toBe(0);
    const c = run();
    c.passives.push({ id: 'chef', level: 1 });
    sprinkle(c, 200, 0, 3);
    sprinkle(c, -150, 120, 3);
    for (let i = 0; i < 300 && c.pickups.some((p) => p.value === 3); i++) c.step(1 / 60, still);
    expect(c.chefs).toHaveLength(1);
    expect(c.pickups.filter((p) => p.value === 3)).toHaveLength(0);
    // Level 5: three helpers.
    while (c.state === 'levelup') c.skip();
    c.passives[0].level = 5;
    c.step(1 / 60, still);
    expect(c.chefs).toHaveLength(3);
  });
  it('helpers stay within reach of you, and leave pie tins to you', () => {
    const c = run();
    c.passives.push({ id: 'chef', level: 1 });
    sprinkle(c, 900, 0, 7);
    c.pickups.push({ kind: 'chest', x: 150, y: 0, value: 1, pulled: false });
    play(c, 3);
    expect(c.pickups.some((p) => p.kind === 'xp' && p.value === 7)).toBe(true);
    expect(c.pickups.some((p) => p.kind === 'chest')).toBe(true);
  });
  it('the Fridge Magnet pulls every sprinkle on the floor in, every so often', () => {
    const r = run({ pantry: { pulse: 3 } });
    r.hp = r.stats.maxHp = 1e9;
    expect(r.stats.pulse).toBe(PULSE_SECONDS[3]);
    for (let i = 0; i < 6; i++) sprinkle(r, 300 + i * 40, -200, 50);
    play(r, PULSE_SECONDS[3] - 1);
    expect(r.pickups.filter((p) => p.value === 50)).toHaveLength(6);
    play(r, 5);
    expect(r.pickups.filter((p) => p.value === 50)).toHaveLength(0);
    expect(run().stats.pulse).toBe(0);
  });
  it('more pickup range pulls pickups in faster', () => {
    const near = run();
    const far = run({ pantry: { magnet: 3 } });
    for (const r of [near, far]) {
      r.pickups.push({ kind: 'xp', x: 60, y: 0, value: 1, pulled: true });
      r.step(0.05, still);
    }
    expect(far.pickups.length ? far.pickups[0].x : 0).toBeLessThan(near.pickups[0].x);
  });
  it('Auto-Hop dodges a pest about to touch you, unless it is switched off', () => {
    const r = run({ pantry: { autohop: 1 } });
    place(r, 'raccoon', 30, 0);
    r.step(1 / 60, still);
    expect(r.hp).toBe(100);
    for (let i = 0; i < 12; i++) r.step(1 / 60, still);
    // It hopped clear of the raccoon.
    expect(Math.hypot(r.x - 30, r.y)).toBeGreaterThan(30 + HOP.distance * 0.8);
    const off = run({ pantry: { autohop: 1 }, autoHop: false });
    place(off, 'raccoon', 30, 0);
    for (let i = 0; i < 20; i++) off.step(1 / 60, still);
    expect(off.hp).toBeLessThan(100);
    expect(run().stats.autoHop).toBe(false);
  });
  it('the Recipe Book finishes evolutions first, then levels what you have', () => {
    const r = run();
    r.weapons[0].level = 4;
    r.offers = [
      { type: 'passive', id: 'batter', level: 1 },
      { type: 'passive', id: 'yeast', level: 1 },
      { type: 'weapon', id: 'pin', level: 1 },
    ];
    expect(r.autoChoice()).toBe(1);
    r.offers = [
      { type: 'weapon', id: 'pin', level: 1 },
      { type: 'weapon', id: 'blaster', level: 5 },
      { type: 'passive', id: 'batter', level: 1 },
    ];
    expect(r.autoChoice()).toBe(1);
    r.offers = [{ type: 'snack' }, { type: 'milk' }];
    r.hp = 20;
    expect(r.autoChoice()).toBe(1);
  });
});
