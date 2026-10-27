// Sugar Crash numbers: how fast the sugar rush climbs, the house edge, the
// betting window, the bankroll and the crowd. Plain data, so it can be tuned
// without touching the rules. Everything is play money: coins can't be
// bought, and they can't be cashed out.

/** The multiplier is e^(GROWTH·t): 2× at about 11.6 s, 10× at 38 s, 100× at 77 s. */
export const GROWTH = 0.06;
/** The house keeps 1%: P(crash ≥ x) = (1 − HOUSE_EDGE) / x, so about 2 rounds in 100 crash at 1.00×. */
export const HOUSE_EDGE = 0.01;
/** Seconds to place bets before the rush. */
export const BET_SECONDS = 6;
/** Seconds the crash stays on screen before the next countdown. */
export const PAUSE_SECONDS = 3;

export const START_COINS = 1000;
export const MIN_BET = 10;
export const MAX_BET = 100_000;
/** The lowest and highest auto cash-out you can set. */
export const MIN_TARGET = 1.01;
export const MAX_TARGET = 1000;
/** Broke: Grandma slips you coins after a short wait. */
export const REFILL_COINS = 500;
export const REFILL_SECONDS = 30;

/** Multipliers that get a shout and a jingle on the way up. */
export const MILESTONES: readonly number[] = [2, 5, 10, 25, 50, 100, 250, 500, 1000];
export const MILESTONE_NAMES: Readonly<Record<number, string>> = {
  2: 'SUGAR HIGH',
  5: 'ZOOMIES',
  10: 'I CAN SEE SOUNDS',
  25: 'RAINBOW MODE',
  50: 'TIME IS FAKE',
  100: 'PURE SUGAR',
  250: 'SWEET SINGULARITY',
  500: 'BEYOND SWEET',
  1000: 'GALAXY BRAIN',
};

/** Rounds kept for the history strip and the fairness panel. */
export const HISTORY = 30;

// ---------------------------------------------------------------------------
// The crowd: everyone else at the table. Made up, and betting made-up coins.

export const BOT_NAMES: readonly string[] = [
  'WaffleKing',
  'xX_Bagel_Xx',
  'Crumbelina',
  'SirLoin',
  'DonutDave',
  'PicklePam',
  'NachoAverage',
  'Kale_Me_Maybe',
  'TacoTuesday',
  'SconeCold',
  'RollingScones',
  'MacNCheese',
  'GnocchiGnocchi',
  'PhoReal',
  'WokNRoll',
  'LettucePray',
  'BunIntended',
  'ButterFingers',
  'SpudBud',
  'MuffinMan',
  'CinnaMon',
  'SushiRoller',
  'FryGuy',
  'MeatballSub',
  'Brisketeer',
  'OatMilkOtis',
  'ChurroChamp',
  'PretzelLogic',
  'NoodleNinja',
  'HashBrownie',
  'BaconBits',
  'CrepeExpectations',
  'SodaPopPete',
  'Jalapeno_Biz',
  'Granola_Gary',
  'PancakeStack',
  'TofuTerry',
  'CheddarBetter',
  'Cookie_Monstera',
  'Biscuit_Boi',
];

/** How many of them play a round. */
export const CROWD_MIN = 15;
export const CROWD_MAX = 30;
/** Their bets, picked from these, more often the small ones. */
export const BOT_BETS: readonly number[] = [10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 2500, 5000];

/**
 * Where they cash out: most play it safe, some reach, a few go for the moon.
 * Each style is a share of the crowd and a range of targets.
 */
export const BOT_STYLES: readonly { share: number; lo: number; hi: number }[] = [
  { share: 0.45, lo: 1.1, hi: 2 },
  { share: 0.33, lo: 2, hi: 5 },
  { share: 0.16, lo: 5, hi: 20 },
  { share: 0.06, lo: 20, hi: 200 },
];
