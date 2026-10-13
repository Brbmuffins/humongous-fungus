// Sporemonger content: goods, ranks, upgrades and gossip. Plain data, so it
// can be tuned without touching the rules.
import type { MarketGoodDef } from '@shared/market';

export type GoodId = 'apples' | 'honey' | 'morels' | 'truffles' | 'glowcaps' | 'amber';

export interface GoodDef extends MarketGoodDef {
  id: GoodId;
  name: string;
  unit: string;
  units: string;
  latin?: string;
  blurb: string;
  /** Rank needed to trade it. */
  rank: number;
  /** What the town says when the price is about to go up or down. */
  gossip: { up: readonly string[]; down: readonly string[] };
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
    cap: 40,
    moodLength: 0.8,
    moods: { calm: 2, rising: 2, falling: 2, boom: 1, crash: 1, wild: 3 },
    rank: 0,
    gossip: {
      up: ['A cart of apples tipped into the bog. Fewer for sale soon.', 'The cider makers are buying every apple in town.', 'Hail hit the orchards on the hill last night.', 'The innkeeper is baking pies for the whole festival.'],
      down: ['The old orchard dropped its whole crop at once.', 'Apples are piling up behind the inn. Nobody wants them.', 'A farmer from the valley brought three wagons of apples.', 'The wasps got into the cider barrels. Nobody is pressing apples this week.'],
    },
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
    cap: 8,
    moodLength: 3,
    moods: { calm: 5, rising: 1.5, falling: 1.5, boom: 0.3, crash: 0.3, wild: 0.2 },
    rank: 0,
    gossip: {
      up: ['Rain kept the bees home all week.', 'A baker from the city wants honey for the festival.', 'A bear got into the hives on the ridge.', 'The healer is buying honey for her cough syrup.'],
      down: ['The clover is in full bloom. Hives are overflowing.', 'Three new beekeepers set up by the river.', 'Someone found a wild hive the size of a barrel.', 'The candle maker has more wax and honey than she can sell.'],
    },
  },
  {
    id: 'morels',
    name: 'Morels',
    unit: 'basket',
    units: 'baskets',
    latin: 'Morchella esculenta',
    blurb: 'Prized and seasonal. When a flush comes in, prices can boom or crash.',
    mean: 40,
    vol: 0.009,
    revert: 0.008,
    rotPerHour: 0.12,
    cap: 20,
    moodLength: 1,
    moods: { calm: 2, rising: 2, falling: 2, boom: 2.5, crash: 1.5, wild: 1 },
    rank: 1,
    gossip: {
      up: ['Foragers say the morel flush is late this year.', 'Chefs from the coast are asking after morels.', 'The cold snap stopped the morels coming up.', 'The duke wants morels for his wedding feast.'],
      down: ['A huge morel flush came up behind the mill.', 'Everyone went foraging after the rain. Baskets everywhere.', 'The old burn site is covered in morels.', 'A forager guild from the north just arrived with full carts.'],
    },
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
    cap: 4,
    moodLength: 2,
    moods: { calm: 2, rising: 3, falling: 3, boom: 0.6, crash: 0.6, wild: 0.4 },
    rank: 2,
    gossip: {
      up: ['The truffle pigs are sick. Nobody is digging.', 'A noble is planning a truffle feast.', 'Truffle thieves raided the oak grove.', 'A famous cook is coming to judge the harvest fair.'],
      down: ['Someone found a new truffle ground under the old oaks.', 'Trained dogs are digging truffles faster than pigs ever did.', 'The truffle guild is selling off its stores before winter.', 'A wet autumn means a big truffle year.'],
    },
  },
  {
    id: 'glowcaps',
    name: 'Glowcaps',
    unit: 'bundle',
    units: 'bundles',
    latin: 'Mycena chlorophos',
    blurb: 'They light the lanterns of the market. The wildest price in town, and they wilt quickly.',
    mean: 120,
    vol: 0.016,
    revert: 0.01,
    rotPerHour: 0.25,
    cap: 10,
    moodLength: 0.6,
    moods: { calm: 1, rising: 2, falling: 2, boom: 2, crash: 2, wild: 4 },
    rank: 3,
    gossip: {
      up: ['The lantern festival needs every glowcap it can get.', 'A dry spell. The glowcaps have stopped shining.', 'The night watch wants glowcaps for every lamp post.', 'Moths ate half the glowcap patch by the well.'],
      down: ['Glowcaps are sprouting in every ditch after the storm.', 'The lamplighters switched to fireflies this month.', 'The festival was called off. Lantern sellers are dumping glowcaps.', 'The marsh is glowing green from end to end tonight.'],
    },
  },
  {
    id: 'amber',
    name: 'Forest amber',
    unit: 'stone',
    units: 'stones',
    blurb: 'Old tree resin turned to stone. Costly, very slow, and it lasts forever.',
    mean: 900,
    vol: 0.003,
    revert: 0.002,
    rotPerHour: 0,
    cap: 2,
    moodLength: 4,
    moods: { calm: 3, rising: 2, falling: 2, boom: 0.4, crash: 0.4, wild: 0.2 },
    rank: 4,
    gossip: {
      up: ['A jeweler from the capital is in town, buying amber.', 'The amber pits flooded. Digging stopped.', 'The queen wears amber now. Everyone wants some.', 'The amber carvers guild is buying raw stones.'],
      down: ['A seam of amber turned up in the quarry.', 'Fake amber is going around. Buyers are nervous.', 'A storm uprooted old pines and exposed a lot of amber.', 'The jeweler from the capital went home.'],
    },
  },
];

export const GOOD_BY_ID = Object.fromEntries(GOODS.map((g) => [g.id, g])) as Record<GoodId, GoodDef>;

export interface Rank {
  name: string;
  /** Best net worth needed to reach it. */
  worth: number;
}

export const RANKS: readonly Rank[] = [
  { name: 'Basket peddler', worth: 0 },
  { name: 'Stall keeper', worth: 1_000 },
  { name: 'Cart trader', worth: 10_000 },
  { name: 'Shopkeeper', worth: 100_000 },
  { name: 'Trading house', worth: 1e6 },
  { name: 'Guild master', worth: 1e7 },
  { name: 'Spore baron', worth: 1e8 },
];

export const START_CAPS = 250;
/** Rotten stock goes to the compost cart for this share of its value. */
export const COMPOST_SHARE = 0.1;
/** Gaps at least this long get the welcome-back screen. */
export const WELCOME_SECONDS = 60;
/** Gossip kept in the feed. */
export const GOSSIP_KEPT = 12;

export type UpgradeId = 'cellar' | 'cool' | 'gossip' | 'haggle' | 'basket';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  max: number;
  cost(level: number): number;
  /** What the next level does. */
  next(level: number): string;
}

export const GOSSIP_CHANCE = [0.35, 0.55, 0.75, 0.9];
export const GOSSIP_TRUTH = [0.7, 0.78, 0.86, 0.94];
export const SPREADS = [0.03, 0.02, 0.01];
export const COOL_ROT = 0.7;

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'cellar',
    name: 'Bigger cellar',
    max: 12,
    cost: (l) => 300 * 4 ** l,
    next: (l) => `Store twice as much of every good (×${2 ** (l + 1)} the starting space).`,
  },
  {
    id: 'cool',
    name: 'Cool stones',
    max: 3,
    cost: (l) => [1_500, 20_000, 300_000][l],
    next: (l) => `Stock rots ${Math.round((1 - COOL_ROT ** (l + 1)) * 100)}% slower.`,
  },
  {
    id: 'gossip',
    name: 'Gossip network',
    max: 3,
    cost: (l) => [600, 9_000, 120_000][l],
    next: (l) =>
      `Hear more rumors (${Math.round(GOSSIP_CHANCE[l + 1] * 100)}% of price turns) and trust them more (right ${Math.round(GOSSIP_TRUTH[l + 1] * 100)}% of the time).`,
  },
  {
    id: 'haggle',
    name: 'Haggling',
    max: 2,
    cost: (l) => [8_000, 250_000][l],
    next: (l) => `The market keeps ${Math.round(SPREADS[l + 1] * 100)}% of each sale instead of ${Math.round(SPREADS[l] * 100)}%.`,
  },
  {
    id: 'basket',
    name: 'Foraging basket',
    max: 6,
    cost: (l) => 40 * 5 ** l,
    next: (l) => `Each forage finds ${l + 2}× as many caps.`,
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;
