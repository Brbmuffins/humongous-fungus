// Hammy Mines: his floor is a grid of pizza boxes (4×4, 8×8 or 16×16).
// Under most of them is a Dorkito he was saving. Under some of them, he
// pooped. Pick boxes one at a time: every Dorkito raises what you'd get
// back, the first poop loses the bet. Choose the board and how many poops
// before you start (more poop, more pay). Plain rules and content here; the
// screen is in minesview.ts, the coins in arcade.ts.
import { RTP, floor2 } from './arcade';

type Roll = () => number;

export type MinesGrid = 4 | 8 | 16;
export const MINES_GRIDS: readonly MinesGrid[] = [4, 8, 16];
/** Poops on a new board of each size. */
export const MINES_DEFAULT: Record<MinesGrid, number> = { 4: 3, 8: 10, 16: 40 };
/** The most a run can pay, so a near-impossible one can't print coins forever. */
export const MINES_CAP = 1_000_000;

export const tilesOf = (grid: MinesGrid): number => grid * grid;

/** Between 1 poop and all but one box. */
export function clampMines(grid: MinesGrid, n: number): number {
  const v = Math.floor(Number.isFinite(n) ? n : MINES_DEFAULT[grid]);
  return Math.min(tilesOf(grid) - 1, Math.max(1, v));
}

/** Which boxes hide poop: `count` of them, shuffled by `roll`. */
export function layMines(grid: MinesGrid, count: number, roll: Roll = Math.random): boolean[] {
  const n = clampMines(grid, count);
  const tiles = Array.from({ length: tilesOf(grid) }, (_, i) => i < n);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

/**
 * What `picks` Dorkitos in a row pay on this board with `mines` poops: the
 * fair odds of getting that far, less the 1% edge, up to MINES_CAP. Nothing
 * picked is 1×.
 */
export function minesMultiplier(grid: MinesGrid, mines: number, picks: number): number {
  const total = tilesOf(grid);
  const n = clampMines(grid, mines);
  const k = Math.max(0, Math.min(total - n, Math.floor(picks)));
  if (!k) return 1;
  let m = RTP;
  for (let i = 0; i < k && m < MINES_CAP; i++) m *= (total - i) / (total - n - i);
  return Math.min(MINES_CAP, floor2(m));
}

/** He comments as you dig. */
export const MINES_SAFE: readonly string[] = ['Dorkito!', 'Crunchy.', 'Still good. Probably.', 'Hey, that one’s mine.', 'Under there the whole time.', 'Five-second rule.'];
export const MINES_BOOM: readonly string[] = ['I was gonna tell you about that one.', 'NOT a Dorkito.', 'That one’s fresh.', 'Ope.', 'Don’t look at me.'];
export const MINES_CLEARED = 'You found every Dorkito. I’m impressed and also hungry.';
