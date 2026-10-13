// Game content: producers, upgrades, specimens and biomes.
// Everything here is plain data so it can be tuned (and simulated) without
// touching the economy code.

export type ProducerId =
  | 'hyphae'
  | 'bonnet'
  | 'moss'
  | 'springtail'
  | 'fern'
  | 'pillbug'
  | 'snail'
  | 'frog';

export interface ProducerDef {
  id: ProducerId;
  name: string;
  plural: string;
  latin?: string;
  blurb: string;
  baseCost: number;
  /** Nutrients per second for one of these, before multipliers. */
  baseRate: number;
}

export const PRODUCERS: readonly ProducerDef[] = [
  {
    id: 'hyphae',
    name: 'Hypha',
    plural: 'Hyphae',
    blurb: 'A new thread of your network. It digests fallen leaves.',
    baseCost: 15,
    baseRate: 0.1,
  },
  {
    id: 'bonnet',
    name: 'Bonnet mushroom',
    plural: 'Bonnet mushrooms',
    latin: 'Mycena galericulata',
    blurb: 'Small caps that push up from the soil and drop spores.',
    baseCost: 100,
    baseRate: 1,
  },
  {
    id: 'moss',
    name: 'Cushion moss',
    plural: 'Cushion moss',
    latin: 'Leucobryum glaucum',
    blurb: 'Holds water in the jar. Old stems rot back into the soil.',
    baseCost: 1100,
    baseRate: 8,
  },
  {
    id: 'springtail',
    name: 'Springtail',
    plural: 'Springtails',
    latin: 'Folsomia candida',
    blurb: 'Tiny jumpers that graze mold and carry your spores around.',
    baseCost: 12_000,
    baseRate: 47,
  },
  {
    id: 'fern',
    name: 'Boston fern',
    plural: 'Boston ferns',
    latin: 'Nephrolepis exaltata',
    blurb: 'Its roots trade sugar for your nutrients. Shed fronds feed the soil.',
    baseCost: 130_000,
    baseRate: 260,
  },
  {
    id: 'pillbug',
    name: 'Pill bug',
    plural: 'Pill bugs',
    latin: 'Armadillidium vulgare',
    blurb: 'Shreds wood and leaves into pieces your threads can digest.',
    baseCost: 1.4e6,
    baseRate: 1_400,
  },
  {
    id: 'snail',
    name: 'Garden snail',
    plural: 'Garden snails',
    latin: 'Cornu aspersum',
    blurb: 'Grazes algae off the glass and leaves rich droppings behind.',
    baseCost: 2e7,
    baseRate: 7_800,
  },
  {
    id: 'frog',
    name: 'Dyeing dart frog',
    plural: 'Dyeing dart frogs',
    latin: 'Dendrobates tinctorius',
    blurb: 'The top of the food chain. Everything it eats returns to the soil.',
    baseCost: 3.3e8,
    baseRate: 44_000,
  },
];

export const PRODUCER_IDS: readonly ProducerId[] = PRODUCERS.map((p) => p.id);
export const PRODUCER_BY_ID = Object.fromEntries(PRODUCERS.map((p) => [p.id, p])) as Record<
  ProducerId,
  ProducerDef
>;

// ---------------------------------------------------------------------------
// Tuning constants

/** Each producer costs this much more than the previous one bought. */
export const COST_GROWTH = 1.15;
/** Owning this many of one producer doubles its output, once per step. */
export const MILESTONES: readonly number[] = [25, 50, 100, 150, 200, 250, 300, 400, 500];
/** Hours of progress counted while the game is closed, before upgrades. */
export const BASE_AWAY_HOURS = 2;
/** A gap between ticks longer than this is treated as time away. */
export const AWAY_THRESHOLD_SECONDS = 5;
/** Nutrients one jar must digest before it can release spores. */
export const SPORE_REQUIREMENT = 1e10;
/** Spores released = floor(sqrt(jarTotal / SPORE_DIVISOR)). */
export const SPORE_DIVISOR = 1e8;
/** Production bonus per spore. */
export const SPORE_BONUS = 0.1;
export const FRENZY_MULT = 7;
export const FRENZY_SECONDS = 30;
/** Seconds between blooms, before specimen bonuses. */
export const BLOOM_INTERVAL: readonly [number, number] = [90, 240];
export const BLOOM_LIFETIME_SECONDS = 13;

// ---------------------------------------------------------------------------
// Upgrades

export type Effect =
  | { type: 'producerMult'; target: ProducerId; mult: number }
  | { type: 'synergy'; target: ProducerId; source: ProducerId; perSource: number }
  | { type: 'globalMult'; mult: number }
  | { type: 'tapFlat'; amount: number }
  | { type: 'tapMult'; mult: number }
  | { type: 'tapRatePct'; pct: number }
  | { type: 'awayHours'; hours: number }
  | { type: 'bloomRate'; mult: number };

export type Unlock = { producer: ProducerId; owned: number } | { jarTotal: number };

export type UpgradeGroup = 'producer' | 'synergy' | 'tap' | 'global' | 'away';

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  unlock: Unlock;
  effect: Effect;
  group: UpgradeGroup;
  /** Kept when the jar is sealed and a new one starts. */
  keep?: boolean;
}

const TIER_NAMES: Record<ProducerId, readonly [string, string, string, string]> = {
  hyphae: ['Branching tips', 'Fused threads', 'Rhizomorph cables', 'Wood wide web'],
  bonnet: ['Thicker caps', 'Spore showers', 'Fairy ring', 'Mushroom flush'],
  moss: ['Wet cushions', 'Spore capsules', 'Moss carpet', 'Peat bed'],
  springtail: ['Spring-loaded tails', 'Mold grazing', 'Swarm', 'Population boom'],
  fern: ['Fiddleheads', 'Spore dots', 'Frond canopy', 'Rhizome mat'],
  pillbug: ['Leaf shredders', 'Brood pouches', 'Woodpile colony', 'Molt cycle'],
  snail: ['Slime trails', 'Chalk grazing', 'Snail nursery', 'Spiral shells'],
  frog: ['Sticky toes', 'Warning colors', 'Tadpole pool', 'Dawn chorus'],
};

const TIERS = [
  { owned: 1, costMult: 10 },
  { owned: 10, costMult: 50 },
  { owned: 25, costMult: 500 },
  { owned: 50, costMult: 50_000 },
] as const;

const producerUpgrades: UpgradeDef[] = PRODUCERS.flatMap((p) =>
  TIERS.map((tier, i) => ({
    id: `${p.id}-${i + 1}`,
    name: TIER_NAMES[p.id][i],
    desc: `${p.plural} produce twice as much.`,
    cost: p.baseCost * tier.costMult,
    unlock: { producer: p.id, owned: tier.owned },
    effect: { type: 'producerMult', target: p.id, mult: 2 } as const,
    group: 'producer' as const,
  })),
);

const synergyUpgrades: UpgradeDef[] = [
  {
    id: 'spore-couriers',
    name: 'Spore couriers',
    desc: 'Hyphae gain 2% for each springtail.',
    cost: 60_000,
    unlock: { producer: 'springtail', owned: 5 },
    effect: { type: 'synergy', target: 'hyphae', source: 'springtail', perSource: 0.02 },
    group: 'synergy',
  },
  {
    id: 'mycorrhiza',
    name: 'Mycorrhiza',
    desc: 'Boston ferns gain 1% for each hypha. Roots and threads trade food.',
    cost: 1.3e6,
    unlock: { producer: 'fern', owned: 5 },
    effect: { type: 'synergy', target: 'fern', source: 'hyphae', perSource: 0.01 },
    group: 'synergy',
  },
  {
    id: 'frass',
    name: 'Frass',
    desc: 'Cushion moss gains 2% for each pill bug. Bug droppings make rich soil.',
    cost: 1.5e7,
    unlock: { producer: 'pillbug', owned: 5 },
    effect: { type: 'synergy', target: 'moss', source: 'pillbug', perSource: 0.02 },
    group: 'synergy',
  },
  {
    id: 'food-web',
    name: 'Food web',
    desc: 'Dart frogs gain 1% for each springtail.',
    cost: 3.3e9,
    unlock: { producer: 'frog', owned: 5 },
    effect: { type: 'synergy', target: 'frog', source: 'springtail', perSource: 0.01 },
    group: 'synergy',
  },
];

const tapUpgrades: UpgradeDef[] = [
  {
    id: 'enzymes',
    name: 'Digestive enzymes',
    desc: 'Each tap digests 1 more nutrient.',
    cost: 50,
    unlock: { jarTotal: 20 },
    effect: { type: 'tapFlat', amount: 1 },
    group: 'tap',
  },
  {
    id: 'cellulase',
    name: 'Cellulase',
    desc: 'Each tap digests 4 more nutrients.',
    cost: 1_000,
    unlock: { jarTotal: 500 },
    effect: { type: 'tapFlat', amount: 4 },
    group: 'tap',
  },
  {
    id: 'exoenzymes',
    name: 'Exoenzymes',
    desc: 'Each tap also digests 2% of your per-second rate.',
    cost: 20_000,
    unlock: { jarTotal: 5_000 },
    effect: { type: 'tapRatePct', pct: 0.02 },
    group: 'tap',
  },
  {
    id: 'lignin-breakers',
    name: 'Lignin breakers',
    desc: 'Each tap digests another 3% of your per-second rate.',
    cost: 2e6,
    unlock: { jarTotal: 5e5 },
    effect: { type: 'tapRatePct', pct: 0.03 },
    group: 'tap',
  },
  {
    id: 'enzyme-bloom',
    name: 'Enzyme bloom',
    desc: 'Each tap digests another 5% of your per-second rate.',
    cost: 5e8,
    unlock: { jarTotal: 1e8 },
    effect: { type: 'tapRatePct', pct: 0.05 },
    group: 'tap',
  },
];

const globalUpgrades: UpgradeDef[] = [
  {
    id: 'condensation',
    name: 'Condensation cycle',
    desc: 'Water runs down the glass and back into the soil. All production +10%.',
    cost: 2.5e5,
    unlock: { jarTotal: 1e5 },
    effect: { type: 'globalMult', mult: 1.1 },
    group: 'global',
  },
  {
    id: 'charcoal',
    name: 'Charcoal layer',
    desc: 'Keeps the soil sweet and free of rot you did not make. All production +15%.',
    cost: 2.5e7,
    unlock: { jarTotal: 1e7 },
    effect: { type: 'globalMult', mult: 1.15 },
    group: 'global',
  },
  {
    id: 'leaf-drop',
    name: 'Leaf drop',
    desc: 'The plants shed on a schedule now. All production +20%.',
    cost: 2.5e9,
    unlock: { jarTotal: 1e9 },
    effect: { type: 'globalMult', mult: 1.2 },
    group: 'global',
  },
  {
    id: 'closed-loop',
    name: 'Closed loop',
    desc: 'Nothing leaves the jar and nothing goes to waste. All production +25%.',
    cost: 2.5e11,
    unlock: { jarTotal: 1e11 },
    effect: { type: 'globalMult', mult: 1.25 },
    group: 'global',
  },
];

const awayUpgrades: UpgradeDef[] = [
  { hours: 2, cost: 2_000, unlock: 500 },
  { hours: 4, cost: 2e5, unlock: 5e4 },
  { hours: 4, cost: 2e7, unlock: 5e6 },
  { hours: 12, cost: 2e9, unlock: 5e8 },
].map((u, i, all) => {
  const total = BASE_AWAY_HOURS + all.slice(0, i + 1).reduce((sum, x) => sum + x.hours, 0);
  return {
    id: `dormancy-${i + 1}`,
    name: `Dormancy ${['I', 'II', 'III', 'IV'][i]}`,
    desc: `Your network keeps digesting for up to ${total} hours while you're away. Kept between jars.`,
    cost: u.cost,
    unlock: { jarTotal: u.unlock },
    effect: { type: 'awayHours', hours: u.hours } as const,
    group: 'away' as const,
    keep: true,
  };
});

export const UPGRADES: readonly UpgradeDef[] = [
  ...producerUpgrades,
  ...synergyUpgrades,
  ...tapUpgrades,
  ...globalUpgrades,
  ...awayUpgrades,
];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((u) => [u.id, u]));

// ---------------------------------------------------------------------------
// Specimens: rare species grown in real time. Kept forever once harvested.

export interface SpecimenDef {
  id: string;
  name: string;
  latin: string;
  blurb: string;
  cost: number;
  seconds: number;
  effect: Effect;
  effectText: string;
}

export const SPECIMENS: readonly SpecimenDef[] = [
  {
    id: 'glowcap',
    name: 'Glowcap',
    latin: 'Mycena chlorophos',
    blurb: 'A cousin of your bonnets that glows green in the dark.',
    cost: 750,
    seconds: 5 * 60,
    effect: { type: 'globalMult', mult: 1.1 },
    effectText: 'All production +10%',
  },
  {
    id: 'sundew',
    name: 'Cape sundew',
    latin: 'Drosera capensis',
    blurb: 'Sticky leaves catch gnats. What it eats ends up in the soil.',
    cost: 40_000,
    seconds: 30 * 60,
    effect: { type: 'tapMult', mult: 2 },
    effectText: 'Taps digest twice as much',
  },
  {
    id: 'lichen',
    name: 'Pixie-cup lichen',
    latin: 'Cladonia fimbriata',
    blurb: 'A fungus and an alga living as one body.',
    cost: 3e6,
    seconds: 2 * 3600,
    effect: { type: 'globalMult', mult: 1.25 },
    effectText: 'All production +25%',
  },
  {
    id: 'coral',
    name: 'Coral fungus',
    latin: 'Ramaria formosa',
    blurb: 'Branching orange fruit bodies that grow on old wood.',
    cost: 1.5e8,
    seconds: 4 * 3600,
    effect: { type: 'bloomRate', mult: 2 },
    effectText: 'Blooms appear twice as often',
  },
  {
    id: 'ghostpipe',
    name: 'Ghost pipe',
    latin: 'Monotropa uniflora',
    blurb: 'A white plant with no green at all. It feeds on fungal networks like yours.',
    cost: 1e10,
    seconds: 8 * 3600,
    effect: { type: 'awayHours', hours: 8 },
    effectText: '+8 hours of progress while away',
  },
  {
    id: 'beetle',
    name: 'Golden stag beetle',
    latin: 'Lamprima aurata',
    blurb: 'Its larvae spend years chewing rotten logs into soil.',
    cost: 1e12,
    seconds: 24 * 3600,
    effect: { type: 'globalMult', mult: 2 },
    effectText: 'All production ×2',
  },
];

export const SPECIMEN_BY_ID: ReadonlyMap<string, SpecimenDef> = new Map(SPECIMENS.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// Biomes: each sealed jar starts the next one. Cosmetic for now.

export const BIOMES = ['Forest Floor', 'Cloud Forest', 'Peat Bog', 'Limestone Cave'] as const;

export function biomeName(jarIndex: number): string {
  return BIOMES[jarIndex % BIOMES.length];
}

export function jarLabel(jarIndex: number): string {
  return `Jar ${roman(jarIndex + 1)}`;
}

export function roman(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [value, glyph] of table) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The forest market: goods with live prices. Buy low, sell high, and mind the
// rot. Prices are an index around each good's `mean`; one index point costs
// one second of your production, locked in when you buy.

export type GoodId = 'apples' | 'morels' | 'truffles' | 'honey';
export type Mood = 'calm' | 'rising' | 'falling' | 'boom' | 'crash' | 'wild';

export interface GoodDef {
  id: GoodId;
  name: string;
  unit: string;
  units: string;
  latin?: string;
  blurb: string;
  /** Long-run average price index. */
  mean: number;
  /** Random swing per tick (log scale). */
  vol: number;
  /** Pull back toward the mean per tick. */
  revert: number;
  /** Share of held stock that rots per hour. */
  rotPerHour: number;
  /** Most you can hold. */
  cap: number;
  /** How long moods last, relative to the base. */
  moodLength: number;
  moods: Record<Mood, number>;
}

export const GOODS: readonly GoodDef[] = [
  {
    id: 'apples',
    name: 'Windfall apples',
    unit: 'crate',
    units: 'crates',
    latin: 'Malus domestica',
    blurb: 'Cheap and jumpy. They rot fast, so sell before they turn.',
    mean: 10,
    vol: 0.012,
    revert: 0.012,
    rotPerHour: 0.4,
    cap: 400,
    moodLength: 0.8,
    moods: { calm: 2, rising: 2, falling: 2, boom: 1, crash: 1, wild: 3 },
  },
  {
    id: 'morels',
    name: 'Morels',
    unit: 'basket',
    units: 'baskets',
    latin: 'Morchella esculenta',
    blurb: 'Prized and seasonal. When a flush comes in, prices can boom.',
    mean: 40,
    vol: 0.009,
    revert: 0.008,
    rotPerHour: 0.12,
    cap: 120,
    moodLength: 1,
    moods: { calm: 2, rising: 2, falling: 2, boom: 2.5, crash: 1.5, wild: 1 },
  },
  {
    id: 'truffles',
    name: 'Black truffles',
    unit: 'truffle',
    units: 'truffles',
    latin: 'Tuber melanosporum',
    blurb: 'Expensive and slow. Trends last a long time, up or down.',
    mean: 250,
    vol: 0.005,
    revert: 0.003,
    rotPerHour: 0.03,
    cap: 20,
    moodLength: 2,
    moods: { calm: 2, rising: 3, falling: 3, boom: 0.6, crash: 0.6, wild: 0.4 },
  },
  {
    id: 'honey',
    name: 'Wildflower honey',
    unit: 'pot',
    units: 'pots',
    blurb: 'Slow, and it never spoils. Buy it cheap before bed and sell it high tomorrow.',
    mean: 60,
    vol: 0.004,
    revert: 0.004,
    rotPerHour: 0,
    cap: 80,
    moodLength: 3,
    moods: { calm: 5, rising: 1.5, falling: 1.5, boom: 0.3, crash: 0.3, wild: 0.2 },
  },
];

export const GOOD_IDS: readonly GoodId[] = GOODS.map((g) => g.id);
export const GOOD_BY_ID = Object.fromEntries(GOODS.map((g) => [g.id, g])) as Record<GoodId, GoodDef>;

/** Drift per tick for a good with vol 0.01; scaled by each good's own vol. */
export const MOODS: Record<Mood, { drift: number; vol: number }> = {
  calm: { drift: 0, vol: 0.6 },
  rising: { drift: 0.0014, vol: 1 },
  falling: { drift: -0.0014, vol: 1 },
  boom: { drift: 0.005, vol: 1.3 },
  crash: { drift: -0.006, vol: 1.4 },
  wild: { drift: 0, vol: 2.4 },
};

/** Real time between price changes. */
export const MARKET_TICK_MS = 3000;
/** Prices kept for the chart: 160 ticks is 8 minutes. */
export const MARKET_HISTORY = 160;
/** At most this much time away is simulated (older ticks are skipped). */
export const MARKET_MAX_CATCHUP_TICKS = (7 * 24 * 3600 * 1000) / MARKET_TICK_MS;
/** The market keeps this share of every sale. */
export const MARKET_SPREAD = 0.03;
/** Rotten stock is digested for this share of its value. */
export const ROT_SALVAGE = 0.25;
/** The market opens once a jar has digested this much. */
export const MARKET_UNLOCK = 5_000;
