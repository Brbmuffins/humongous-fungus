// Poop Plinko: Hammy squats over a board of pegs and drops one. It bounces
// left or right off every row and lands in a toilet at the bottom; the
// toilets at the edges pay big, the clogged ones in the middle don't. More
// rows and more risk make the edges pay more. Plain rules and content here;
// the screen is in plinkoview.ts, the coins in arcade.ts.

type Roll = () => number;

export type PlinkoRows = 8 | 12 | 16;
export type PlinkoRisk = 'low' | 'medium' | 'high';

export const PLINKO_ROWS: readonly PlinkoRows[] = [8, 12, 16];
export const PLINKO_RISKS: readonly PlinkoRisk[] = ['low', 'medium', 'high'];

/**
 * Each board's toilets from the left edge to the middle (the right half is
 * the same, mirrored). Every table pays back just under 99% (RTP in
 * arcade.ts) on a fair bounce; the test checks it.
 */
const HALF: Record<PlinkoRows, Record<PlinkoRisk, readonly number[]>> = {
  8: {
    low: [5.6, 2.7, 1.4, 0.78, 0.47],
    medium: [13, 3.8, 1.3, 0.59, 0.39],
    high: [29, 5.3, 1.1, 0.33, 0.17],
  },
  12: {
    low: [10, 5.6, 3.1, 1.8, 1.1, 0.71, 0.52],
    medium: [33, 13, 5.3, 2.2, 0.97, 0.49, 0.29],
    high: [170, 36, 7.6, 1.7, 0.51, 0.25, 0.21],
  },
  16: {
    low: [16, 9.7, 5.9, 3.7, 2.3, 1.5, 0.98, 0.68, 0.48],
    medium: [110, 45, 19, 7.7, 3.3, 1.5, 0.73, 0.42, 0.28],
    high: [1000, 230, 51, 12, 2.8, 0.79, 0.33, 0.22, 0.18],
  },
};

/** Every toilet's multiplier, left to right: `rows + 1` of them. */
export function plinkoTable(rows: PlinkoRows, risk: PlinkoRisk): number[] {
  const half = HALF[rows][risk];
  return [...half, ...half.slice(0, -1).reverse()];
}

/** The chance of landing in each toilet: how many ways there are to get there. */
export function binOdds(rows: number): number[] {
  const odds: number[] = [1];
  for (let r = 0; r < rows; r++) {
    const next = Array.from({ length: odds.length + 1 }, (_, i) => ((odds[i - 1] ?? 0) + (odds[i] ?? 0)) / 2);
    odds.splice(0, odds.length, ...next);
  }
  return odds;
}

/** What a board pays back on average. */
export const plinkoReturn = (rows: PlinkoRows, risk: PlinkoRisk): number => {
  const odds = binOdds(rows);
  return plinkoTable(rows, risk).reduce((sum, m, i) => sum + m * odds[i], 0);
};

/** One drop: which way it bounces off each row (true is right). */
export const dropPath = (rows: number, roll: Roll = Math.random): boolean[] => Array.from({ length: rows }, () => roll() < 0.5);

/** Where a path ends up: one toilet along for every bounce to the right. */
export const binOf = (path: readonly boolean[]): number => path.filter(Boolean).length;

/** He comments on where it lands. */
export const PLINKO_BIG: readonly string[] = ['GOLDEN POOP', 'That’s the one!', 'Frame that one.', 'Call the scientist!'];
export const PLINKO_MEH: readonly string[] = ['Clogged.', 'Plop.', 'Meh.', 'I can do better.'];
export const PLINKO_GRUNT: readonly string[] = ['hnnngh', 'here it comes', 'one sec', 'oof', 'incoming'];
