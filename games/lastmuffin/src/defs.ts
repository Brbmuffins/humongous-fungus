// Everything in a run of Last Muffin Standing, as data: the weapons, the
// passive upgrades, the pests, the waves they come in, the muffins you can be
// and the Pantry upgrades that carry over between runs. Rules are in run.ts.

// ---------------------------------------------------------------------------
// A run

/** A run lasts from midnight until the bakery opens at 6 AM: 12 minutes. */
export const RUN_SECONDS = 720;
/** Seconds of run time per hour on the clock. */
export const SECONDS_PER_HOUR = RUN_SECONDS / 6;
/** Most weapons and passives you can carry at once. */
export const SLOTS = 5;
export const MAX_LEVEL = 5;

export const PLAYER = {
  hp: 100,
  /** World units a second. The screen shows about 480 across its short side. */
  speed: 120,
  radius: 13,
  /** Sprinkles closer than this fly to you. */
  magnet: 62,
  /** Chance a hit is a BONK: triple damage and a huge knockback. */
  bonk: 0.03,
  bonkDamage: 3,
  /** An enemy can only hurt you this often. */
  contactCooldown: 0.6,
};

/** The hop: a quick dash you can't be hurt during. */
export const HOP = { cooldown: 3.5, distance: 92, seconds: 0.18, safe: 0.32 };

// ---------------------------------------------------------------------------
// Weapons

export type WeaponId = 'blaster' | 'knives' | 'burst' | 'coffee' | 'pin' | 'sprinkles' | 'whisk' | 'frosting';
export type PassiveId = 'batter' | 'mitts' | 'sugar' | 'powder' | 'yeast' | 'top' | 'preserve' | 'bonk';

/**
 * How a weapon behaves:
 * shoot    fires `count` projectiles at the nearest pests
 * orbit    `count` things circle you all the time; `speed` is radians a second
 * nova     `count` projectiles burst out in a ring
 * aura     hurts everything within reach, every `cooldown`
 * boomerang thrown out and back, hitting everything on the way
 * strike   hits `count` random pests on screen from above
 * swipe    sweeps an arc in front of you (and behind, and more, with `count`)
 * puddle   lobs `count` blobs that leave sticky, hurting puddles
 */
export type WeaponKind = 'shoot' | 'orbit' | 'nova' | 'aura' | 'boomerang' | 'strike' | 'swipe' | 'puddle';

export interface WeaponStats {
  damage: number;
  /** Seconds between uses. */
  cooldown: number;
  count: number;
  /** Size multiplier. */
  area: number;
  /** Projectile speed (or orbit speed in radians a second). */
  speed: number;
  /** Pests a projectile can hit before it's used up. */
  pierce: number;
  /** Seconds a projectile or puddle lasts. */
  duration: number;
  knockback: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: WeaponKind;
  blurb: string;
  /** What one of `count` is called, for level-up text: "+1 blueberry". */
  unit: [string, string];
  color: string;
  /** Stats at level 1 to 5. */
  levels: WeaponStats[];
  /** Max level plus this passive, then a pie tin from a boss: it evolves. */
  evolvesWith: PassiveId;
  evolved: { name: string; blurb: string; stats: WeaponStats; color: string };
}

type Delta = Partial<WeaponStats>;

/** Level 1 and the change at each level after it. */
function levels(base: WeaponStats, ...deltas: Delta[]): WeaponStats[] {
  const out = [base];
  for (const d of deltas) {
    const prev = out[out.length - 1];
    const next = { ...prev };
    for (const [k, v] of Object.entries(d) as [keyof WeaponStats, number][]) next[k] = Math.round((prev[k] + v) * 1000) / 1000;
    out.push(next);
  }
  return out;
}

const INF = 1e9;

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'blaster',
    name: 'Blueberry Blaster',
    kind: 'shoot',
    blurb: 'Fires blueberries at the nearest pest.',
    unit: ['blueberry', 'blueberries'],
    color: '#4f6bd8',
    levels: levels(
      { damage: 10, cooldown: 0.9, count: 1, area: 1, speed: 340, pierce: 1, duration: 1.4, knockback: 40 },
      { count: 1 },
      { damage: 5 },
      { count: 1, cooldown: -0.1 },
      { damage: 6, pierce: 1 },
    ),
    evolvesWith: 'yeast',
    evolved: {
      name: 'Blueberry Gatling',
      blurb: 'A blueberry every fifth of a second, through three pests each.',
      color: '#7f5af0',
      stats: { damage: 24, cooldown: 0.18, count: 1, area: 1.15, speed: 470, pierce: 3, duration: 1.4, knockback: 30 },
    },
  },
  {
    id: 'knives',
    name: 'Butter Knives',
    kind: 'orbit',
    blurb: 'Butter knives circle you and cut whatever gets close.',
    unit: ['knife', 'knives'],
    color: '#d8dde6',
    levels: levels(
      { damage: 8, cooldown: 0.45, count: 2, area: 1, speed: 3.2, pierce: INF, duration: 0, knockback: 60 },
      { count: 1 },
      { damage: 4, speed: 0.6 },
      { count: 1 },
      { damage: 5, area: 0.25 },
    ),
    evolvesWith: 'powder',
    evolved: {
      name: 'The Cutlery Drawer',
      blurb: 'Every knife, fork and spoon in the bakery, spinning.',
      color: '#f2e2a8',
      stats: { damage: 22, cooldown: 0.35, count: 8, area: 1.55, speed: 4.6, pierce: INF, duration: 0, knockback: 90 },
    },
  },
  {
    id: 'burst',
    name: 'Crumb Burst',
    kind: 'nova',
    blurb: 'Every so often you shed crumbs in every direction. Violently.',
    unit: ['crumb', 'crumbs'],
    color: '#d9a35b',
    levels: levels(
      { damage: 9, cooldown: 2.6, count: 8, area: 1, speed: 260, pierce: 2, duration: 0.7, knockback: 50 },
      { count: 4 },
      { damage: 5 },
      { count: 4, cooldown: -0.4 },
      { damage: 6, pierce: 2 },
    ),
    evolvesWith: 'batter',
    evolved: {
      name: 'Crumb Apocalypse',
      blurb: 'Twenty-four crumbs, twice as often, through anything.',
      color: '#ffb84d',
      stats: { damage: 26, cooldown: 1.2, count: 24, area: 1.3, speed: 300, pierce: 6, duration: 0.9, knockback: 70 },
    },
  },
  {
    id: 'coffee',
    name: 'Hot Coffee',
    kind: 'aura',
    blurb: 'A cloud of hot coffee steam around you. Pests in it burn and slow down.',
    unit: ['cup', 'cups'],
    color: '#8a5a3c',
    levels: levels(
      { damage: 4, cooldown: 0.5, count: 1, area: 1, speed: 0, pierce: INF, duration: 0, knockback: 8 },
      { area: 0.2 },
      { damage: 3 },
      { area: 0.2, cooldown: -0.05 },
      { damage: 4 },
    ),
    evolvesWith: 'preserve',
    evolved: {
      name: 'Espresso Field',
      blurb: 'Huge, scalding, and every pest it finishes off heals you a little.',
      color: '#5a3422',
      stats: { damage: 14, cooldown: 0.35, count: 1, area: 2, speed: 0, pierce: INF, duration: 0, knockback: 14 },
    },
  },
  {
    id: 'pin',
    name: 'Rolling Pin',
    kind: 'boomerang',
    blurb: 'Thrown, spinning, and it comes back. Hits everything both ways.',
    unit: ['rolling pin', 'rolling pins'],
    color: '#c98a4b',
    levels: levels(
      { damage: 18, cooldown: 2.2, count: 1, area: 1, speed: 300, pierce: INF, duration: 1.3, knockback: 120 },
      { damage: 8 },
      { count: 1 },
      { area: 0.3, damage: 6 },
      { count: 1, cooldown: -0.3 },
    ),
    evolvesWith: 'bonk',
    evolved: {
      name: 'The Bonkinator',
      blurb: 'Three enormous rolling pins. Every hit is a BONK.',
      color: '#e0a060',
      stats: { damage: 44, cooldown: 1.6, count: 3, area: 1.9, speed: 330, pierce: INF, duration: 1.4, knockback: 200 },
    },
  },
  {
    id: 'sprinkles',
    name: 'Sprinkle Storm',
    kind: 'strike',
    blurb: 'Rainbow sprinkles fall from the sky onto random pests. Hard.',
    unit: ['strike', 'strikes'],
    color: '#ff6fa8',
    levels: levels(
      { damage: 16, cooldown: 2, count: 2, area: 1, speed: 0, pierce: INF, duration: 0, knockback: 30 },
      { count: 1 },
      { damage: 8 },
      { count: 1, area: 0.25 },
      { damage: 10, cooldown: -0.4 },
    ),
    evolvesWith: 'top',
    evolved: {
      name: 'Sprinkle Monsoon',
      blurb: 'It is now raining sprinkles. Everywhere. All the time.',
      color: '#7cefd2',
      stats: { damage: 40, cooldown: 1.1, count: 8, area: 1.6, speed: 0, pierce: INF, duration: 0, knockback: 40 },
    },
  },
  {
    id: 'whisk',
    name: 'Whisk',
    kind: 'swipe',
    blurb: 'A big swipe in front of you that sends pests flying.',
    unit: ['side', 'sides'],
    color: '#c9ccd6',
    levels: levels(
      { damage: 16, cooldown: 1.4, count: 1, area: 1, speed: 0, pierce: INF, duration: 0, knockback: 160 },
      { count: 1 },
      { damage: 8 },
      { area: 0.3 },
      { damage: 10, cooldown: -0.3 },
    ),
    evolvesWith: 'sugar',
    evolved: {
      name: 'Stand Mixer',
      blurb: 'Whisks on all four sides, on high.',
      color: '#ff9a2e',
      stats: { damage: 44, cooldown: 0.8, count: 4, area: 1.6, speed: 0, pierce: INF, duration: 0, knockback: 220 },
    },
  },
  {
    id: 'frosting',
    name: 'Frosting Bomb',
    kind: 'puddle',
    blurb: 'Lobs blobs of frosting. Pests that walk in get stuck and hurt.',
    unit: ['blob', 'blobs'],
    color: '#fff1f6',
    levels: levels(
      { damage: 6, cooldown: 3.2, count: 1, area: 1, speed: 140, pierce: INF, duration: 3, knockback: 0 },
      { count: 1 },
      { damage: 4, duration: 1 },
      { area: 0.3 },
      { count: 1, damage: 4 },
    ),
    evolvesWith: 'mitts',
    evolved: {
      name: 'Frosting Flood',
      blurb: 'Four huge puddles that last ages. The floor is frosting now.',
      color: '#ffd0e4',
      stats: { damage: 16, cooldown: 2.5, count: 4, area: 1.7, speed: 160, pierce: INF, duration: 5, knockback: 0 },
    },
  },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<WeaponId, WeaponDef>;

/** What changes between a weapon's level `n` and `n + 1`, in words. */
export function levelText(def: WeaponDef, level: number): string {
  if (level <= 0) return def.blurb;
  const a = def.levels[level - 1];
  const b = def.levels[level];
  if (!b) return '';
  const parts: string[] = [];
  if (b.count > a.count) {
    const n = b.count - a.count;
    parts.push(`+${n} ${def.unit[n === 1 ? 0 : 1]}`);
  }
  if (b.damage > a.damage) parts.push(`+${b.damage - a.damage} damage`);
  if (b.cooldown < a.cooldown) parts.push(def.kind === 'aura' ? 'burns faster' : 'faster');
  if (b.area > a.area) parts.push(`+${Math.round((b.area - a.area) * 100)}% size`);
  if (b.pierce > a.pierce) parts.push(`goes through ${b.pierce - a.pierce} more`);
  if (b.speed > a.speed) parts.push('spins faster');
  if (b.duration > a.duration) parts.push(`lasts ${b.duration - a.duration}s longer`);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Passives

export interface PassiveDef {
  id: PassiveId;
  name: string;
  /** Per level, in words: "+20 max health". */
  each: string;
  /** The effect per level. */
  per: number;
  color: string;
}

export const PASSIVES: readonly PassiveDef[] = [
  { id: 'batter', name: 'Extra Batter', each: '+20 max health', per: 20, color: '#f2d9b0' },
  { id: 'mitts', name: 'Oven Mitts', each: '+1 armor (every hit hurts 1 less)', per: 1, color: '#e8443a' },
  { id: 'sugar', name: 'Sugar Rush', each: '+8% speed', per: 0.08, color: '#ffffff' },
  { id: 'powder', name: 'Baking Powder', each: '+10% weapon size', per: 0.1, color: '#e6ecf5' },
  { id: 'yeast', name: 'Yeast', each: '7% shorter cooldowns', per: 0.07, color: '#e8c46a' },
  { id: 'top', name: 'Muffin Top', each: '+25% pickup range', per: 0.25, color: '#b5793d' },
  { id: 'preserve', name: 'Preservatives', each: '+0.25 health a second', per: 0.25, color: '#7cc8ff' },
  { id: 'bonk', name: 'Big Bonk', each: '+5% chance to BONK (triple damage)', per: 0.05, color: '#ffd34d' },
];

export const PASSIVE_BY_ID = Object.fromEntries(PASSIVES.map((p) => [p.id, p])) as Record<PassiveId, PassiveDef>;

// ---------------------------------------------------------------------------
// Pests

export type EnemyId = 'ant' | 'fly' | 'mouse' | 'roach' | 'pigeon' | 'mold' | 'moldling' | 'raccoon' | 'seagull' | 'queen' | 'ratking' | 'toaster';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  /** Sprinkles (experience) it drops. */
  xp: number;
  /** 0 flies with every hit, 1 doesn't budge. */
  heft: number;
  /** Chance it drops a crumb (currency). */
  crumbs: number;
  /** Wobbles as it chases. */
  wobble?: boolean;
  /** Splits into these when it dies. */
  splits?: { into: EnemyId; n: number };
  boss?: boolean;
}

export const ENEMIES: readonly EnemyDef[] = [
  { id: 'ant', name: 'Ant', hp: 5, speed: 60, damage: 5, radius: 7, xp: 1, heft: 0, crumbs: 0.02 },
  { id: 'fly', name: 'Fruit fly', hp: 3, speed: 92, damage: 3, radius: 6, xp: 1, heft: 0, crumbs: 0.02, wobble: true },
  { id: 'mouse', name: 'Mouse', hp: 16, speed: 76, damage: 8, radius: 11, xp: 2, heft: 0.1, crumbs: 0.04 },
  { id: 'roach', name: 'Cockroach', hp: 30, speed: 90, damage: 10, radius: 11, xp: 3, heft: 0.2, crumbs: 0.05 },
  { id: 'pigeon', name: 'Pigeon', hp: 22, speed: 150, damage: 9, radius: 12, xp: 2, heft: 0.2, crumbs: 0.04 },
  { id: 'mold', name: 'Mold', hp: 60, speed: 38, damage: 12, radius: 16, xp: 5, heft: 0.4, crumbs: 0.08, splits: { into: 'moldling', n: 3 } },
  { id: 'moldling', name: 'Little mold', hp: 10, speed: 62, damage: 6, radius: 8, xp: 1, heft: 0.1, crumbs: 0.01 },
  { id: 'raccoon', name: 'Raccoon', hp: 220, speed: 56, damage: 18, radius: 20, xp: 12, heft: 0.7, crumbs: 0.25 },
  { id: 'seagull', name: 'Seagull', hp: 90, speed: 118, damage: 16, radius: 15, xp: 8, heft: 0.4, crumbs: 0.12 },
  { id: 'queen', name: 'The Queen Ant', hp: 1800, speed: 46, damage: 20, radius: 34, xp: 100, heft: 0.95, crumbs: 1, boss: true },
  { id: 'ratking', name: 'The Rat King', hp: 4800, speed: 52, damage: 26, radius: 38, xp: 200, heft: 0.95, crumbs: 1, boss: true },
  { id: 'toaster', name: 'The Toaster', hp: 9500, speed: 40, damage: 30, radius: 40, xp: 300, heft: 1, crumbs: 1, boss: true },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e])) as Record<EnemyId, EnemyDef>;

/** Pests get tougher as the night goes on: this much more health a minute. */
export const HP_PER_MINUTE = 0.1;
/** After sunrise (overtime) they get tougher much faster. */
export const OVERTIME_HP_PER_MINUTE = 0.35;

/** One minute of the night: who comes, how fast, and how many at once at most. */
export interface Wave {
  mix: Partial<Record<EnemyId, number>>;
  /** Pests a second. */
  rate: number;
  max: number;
}

export const WAVES: readonly Wave[] = [
  { mix: { ant: 3, fly: 2 }, rate: 1.4, max: 40 },
  { mix: { ant: 3, fly: 1, mouse: 2 }, rate: 2, max: 60 },
  { mix: { ant: 2, mouse: 3, roach: 1 }, rate: 2.6, max: 80 },
  { mix: { mouse: 2, roach: 3, ant: 2 }, rate: 3.2, max: 100 },
  { mix: { roach: 3, mold: 2, mouse: 2 }, rate: 3.6, max: 120 },
  { mix: { mold: 3, roach: 3, fly: 2 }, rate: 4, max: 140 },
  { mix: { raccoon: 1, mouse: 3, roach: 3 }, rate: 4.6, max: 160 },
  { mix: { raccoon: 2, mold: 3, roach: 3 }, rate: 5, max: 180 },
  { mix: { seagull: 1, raccoon: 2, roach: 4 }, rate: 5.6, max: 200 },
  { mix: { seagull: 2, raccoon: 2, mold: 3 }, rate: 6.2, max: 230 },
  { mix: { seagull: 3, raccoon: 3, roach: 3, mold: 2 }, rate: 7, max: 260 },
  { mix: { seagull: 4, raccoon: 4, mold: 3, mouse: 2 }, rate: 8, max: 300 },
];

/** Things that happen at a set time of night. */
export type NightEvent =
  | { at: number; type: 'boss'; enemy: EnemyId }
  /** A ring of pests closes in around you. */
  | { at: number; type: 'ring'; enemy: EnemyId; n: number }
  /** A flock flies across the screen. */
  | { at: number; type: 'flock'; enemy: EnemyId; n: number };

export const EVENTS: readonly NightEvent[] = [
  { at: 75, type: 'ring', enemy: 'ant', n: 36 },
  { at: 150, type: 'flock', enemy: 'pigeon', n: 14 },
  { at: 180, type: 'boss', enemy: 'queen' },
  { at: 270, type: 'flock', enemy: 'pigeon', n: 22 },
  { at: 330, type: 'ring', enemy: 'roach', n: 40 },
  { at: 360, type: 'boss', enemy: 'ratking' },
  { at: 450, type: 'ring', enemy: 'mold', n: 28 },
  { at: 500, type: 'flock', enemy: 'seagull', n: 16 },
  { at: 540, type: 'boss', enemy: 'toaster' },
  { at: 620, type: 'ring', enemy: 'raccoon', n: 30 },
  { at: 680, type: 'flock', enemy: 'seagull', n: 28 },
];

/** Things lying on the floor. */
export type PickupKind = 'xp' | 'crumb' | 'milk' | 'magnet' | 'chest';

/** Milk heals this much. */
export const MILK_HEAL = 30;
export const MILK_CHANCE = 0.006;
export const MAGNET_CHANCE = 0.0015;
/** Most sprinkles on the floor; past this they merge. */
export const MAX_SPRINKLES = 300;
/** Crumbs a pie tin from a boss is worth, and the win bonus. */
export const CHEST_CRUMBS = 40;
export const WIN_CRUMBS = 100;

/** Sprinkles to get from level `level` to the next. */
export function xpToNext(level: number): number {
  if (level < 20) return 5 + (level - 1) * 8;
  if (level < 40) return 157 + (level - 20) * 11;
  return 377 + (level - 40) * 14;
}

// ---------------------------------------------------------------------------
// Muffins

export type MuffinId = 'blueberry' | 'choc' | 'bran' | 'lemon' | 'banana' | 'corn' | 'double';

export interface MuffinDef {
  id: MuffinId;
  name: string;
  weapon: WeaponId;
  perk: string;
  /** Crumbs to unlock, or 'win' for winning a run with anyone. */
  price: number | 'win';
  liner: string;
  top: string;
  /** Spots on top: blueberries, chips, seeds. */
  spots: string;
  bonus: Partial<{ might: number; hp: number; speed: number; bonk: number; armor: number; area: number; magnet: number; growth: number }>;
  /** A passive it starts with. */
  passive?: PassiveId;
}

export const MUFFINS: readonly MuffinDef[] = [
  { id: 'blueberry', name: 'Blueberry', weapon: 'blaster', perk: 'Balanced. Bursting with blueberries.', price: 0, liner: '#4f8fd8', top: '#e0a95f', spots: '#3b3f9e', bonus: {} },
  { id: 'choc', name: 'Chocolate Chip', weapon: 'pin', perk: '+15% damage', price: 150, liner: '#e8443a', top: '#d9a35b', spots: '#3a2012', bonus: { might: 0.15 } },
  { id: 'bran', name: 'Bran', weapon: 'coffee', perk: '+50 health, 10% slower. Very regular.', price: 250, liner: '#7a9a3a', top: '#8a5a32', spots: '#5a3a1c', bonus: { hp: 50, speed: -0.1 } },
  { id: 'lemon', name: 'Lemon Poppyseed', weapon: 'sprinkles', perk: '+15% speed, +5% bonk', price: 400, liner: '#f2c230', top: '#f5dc8a', spots: '#222222', bonus: { speed: 0.15, bonk: 0.05 } },
  { id: 'banana', name: 'Banana Nut', weapon: 'knives', perk: '+1 armor, +20% weapon size', price: 600, liner: '#c98a4b', top: '#c28f52', spots: '#6b4423', bonus: { armor: 1, area: 0.2 } },
  { id: 'corn', name: 'Corn Muffin', weapon: 'burst', perk: '+40% pickup range, +10% sprinkles', price: 900, liner: '#5ee0b0', top: '#f2c94c', spots: '#e0a020', bonus: { magnet: 0.4, growth: 0.1 } },
  { id: 'double', name: 'Double Chocolate', weapon: 'whisk', perk: 'Starts with Big Bonk. +10% bonk.', price: 'win', liner: '#2a1a12', top: '#5a3422', spots: '#1a0d08', bonus: { bonk: 0.1 }, passive: 'bonk' },
];

export const MUFFIN_BY_ID = Object.fromEntries(MUFFINS.map((m) => [m.id, m])) as Record<MuffinId, MuffinDef>;

// ---------------------------------------------------------------------------
// The Pantry: upgrades bought with crumbs between runs, kept forever.

export type PantryId = 'might' | 'health' | 'armor' | 'speed' | 'magnet' | 'growth' | 'greed' | 'cooldown' | 'reroll' | 'revive';

export interface PantryDef {
  id: PantryId;
  name: string;
  each: string;
  per: number;
  prices: number[];
}

export const PANTRY: readonly PantryDef[] = [
  { id: 'might', name: 'Extra Sugar', each: '+5% damage', per: 0.05, prices: [60, 120, 200, 320, 480] },
  { id: 'health', name: 'Thick Crust', each: '+10 max health', per: 10, prices: [40, 80, 140, 220, 320] },
  { id: 'armor', name: 'Crusty Edges', each: '+1 armor', per: 1, prices: [100, 250, 500] },
  { id: 'speed', name: 'Light and Fluffy', each: '+5% speed', per: 0.05, prices: [80, 180, 320] },
  { id: 'magnet', name: 'Sticky Fingers', each: '+15% pickup range', per: 0.15, prices: [50, 120, 220] },
  { id: 'growth', name: 'Sourdough Starter', each: '+6% sprinkles (experience)', per: 0.06, prices: [70, 140, 240, 360, 520] },
  { id: 'greed', name: 'Tip Jar', each: '+10% crumbs', per: 0.1, prices: [60, 130, 220, 340, 500] },
  { id: 'cooldown', name: 'Preheated Oven', each: '3% shorter cooldowns', per: 0.03, prices: [150, 320, 600] },
  { id: 'reroll', name: 'Second Opinion', each: '+1 reroll a run', per: 1, prices: [120, 280, 500] },
  { id: 'revive', name: 'Day-Old Discount', each: 'Come back once a run, at half health', per: 1, prices: [800] },
];

export const PANTRY_BY_ID = Object.fromEntries(PANTRY.map((p) => [p.id, p])) as Record<PantryId, PantryDef>;

// ---------------------------------------------------------------------------
// Words

export const DEATH_LINES = ['Stale.', 'Eaten.', 'Crumbs.', 'Gone stale.', 'You got snacked.', 'Day-old.'];
export const WIN_LINES = ['The bakery is open. You made it.', 'Sunrise. The pests go home.', 'Fresh out of the oven, still standing.'];

/** The clock on the wall: 12:00 AM at the start, 6:00 AM at sunrise. */
export function clockText(seconds: number): string {
  const minutes = Math.floor((seconds / SECONDS_PER_HOUR) * 60);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
