// Hammy Slots: a five-reel, three-row slot machine with twenty zig-zag
// paylines and a pinball multiplier orb. Plain rules and content here, with no
// DOM and no Math.random: every spin takes its random numbers from a `roll`
// function, so the same rules can run in the browser (crypto numbers, see
// fairRoll in arcadeview.ts), in a test (seeded numbers), or on a server. The
// screen is in slotsview.ts, the drawings in slotsart.ts, the exact
// payback maths in slotsmath.ts and the coins in arcade.ts.
//
// How a spin works
//  1. Each reel stops on a random place on its strip and shows the three
//     symbols from there down (the strips wrap round).
//  2. A payline pays when 3, 4 or 5 matching symbols run along it from the
//     left. Hammy's meatball-sub WILD (reels 2 to 4) stands in for anything
//     but the ORB. Each line pays its own table, in line bets; a line bet is
//     the bet over the number of lines.
//  3. The ORB (reels 2 to 4) pays nothing on a line. Two or more orbs on the
//     grid, or a 1-in-SNEEZE_ONE_IN "Hammy sneezes", launch the multiplier
//     orb: one ball for each orb that landed (a sneeze adds one, unless the orbs went off anyway). Each ball
//     pinballs round the grid, ORB_HITS bounces, and every symbol it hits
//     either adds to the spin's win (+½ bet, +1 bet…) or multiplies all of it
//     so far (×2, ×3…). It starts from the line win, or from nothing if there
//     wasn't one, so even a dry spin can end up a winner.
//  4. A spin never pays more than MAX_WIN times the bet.
// Everything the orb does is rolled up front, in `spin`; the screen only plays
// it back.

export type Roll = () => number;

export const REELS = 5;
export const ROWS = 3;

/** The most a spin can pay, as a multiple of the bet. */
export const MAX_WIN = 5000;

/** One in this many spins Hammy sneezes and launches an orb of his own. */
export const SNEEZE_ONE_IN = 50;
/** Orbs on the grid it takes to launch the multiplier orb. */
export const ORB_TRIGGER = 2;
/** Bounces for each ball. */
export const ORB_HITS = 3;

/**
 * How loud a win is. Under the bet it's not a win (the readout stays quiet, no
 * jingle, no shake); from the bet up it escalates.
 */
export interface WinTier {
  min: number;
  label: string;
  color: string;
}
export const WIN_TIERS: readonly WinTier[] = [
  { min: 250, label: 'HAMMY WIN', color: '#7be8ff' },
  { min: 50, label: 'HUGE WIN', color: '#ff7bd5' },
  { min: 10, label: 'BIG WIN', color: '#ffa63d' },
  { min: 1, label: 'WIN', color: '#ffd34d' },
];
/** The tier a multiple of the bet reaches, or null when it's under the bet. */
export const tierOf = (mult: number): WinTier | null => WIN_TIERS.find((t) => mult >= t.min) ?? null;

// Symbols -------------------------------------------------------------------

export type SlotSymbol = 'dorkito' | 'pizza' | 'sneaker' | 'tp' | 'clipboard' | 'grandma' | 'vacuum' | 'toilet' | 'hammy' | 'wild' | 'orb';

export interface SymbolDef {
  id: SlotSymbol;
  /** The letter it has on the reel strips below. */
  ch: string;
  name: string;
  /** What 3, 4 and 5 in a row pay, in line bets. Null for the wild and the orb. */
  pays: readonly [number, number, number] | null;
}

/** Cheapest first, then the wild and the orb. */
export const SYMBOLS: readonly SymbolDef[] = [
  { id: 'dorkito', ch: 'D', name: 'Dorkito', pays: [8, 16, 50] },
  { id: 'pizza', ch: 'P', name: 'Pizza box', pays: [8, 16, 50] },
  { id: 'sneaker', ch: 'S', name: 'Sneaker', pays: [20, 36, 120] },
  { id: 'tp', ch: 'T', name: 'Toilet paper', pays: [20, 40, 140] },
  { id: 'clipboard', ch: 'C', name: 'Dr. Moss’s clipboard', pays: [22, 50, 220] },
  { id: 'grandma', ch: 'G', name: 'Grandma', pays: [24, 64, 320] },
  { id: 'vacuum', ch: 'V', name: 'Robot vacuum', pays: [28, 84, 1200] },
  { id: 'toilet', ch: 'L', name: 'The toilet', pays: [34, 100, 2500] },
  { id: 'hammy', ch: 'H', name: 'Cube Hammy', pays: [80, 400, 25600] },
  { id: 'wild', ch: 'W', name: 'Meatball sub (wild)', pays: null },
  { id: 'orb', ch: 'O', name: 'Multiplier orb', pays: null },
];

export const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((s) => [s.id, s])) as Record<SlotSymbol, SymbolDef>;

/**
 * The reels, one string each, top to bottom, wrapping round. A reel stops on
 * a random place on its strip, so a symbol's share of the letters is its
 * chance of showing in any one place. The wild and the orb are on reels 2 to
 * 4 only.
 */
export const STRIPS: readonly string[] = [
  'LPCDSPLSCDVPGCHSLPDT',
  'HSTPGOTVGWDCVTGDVLTG',
  'SCHVLPDGSPVGWLDPTVOD',
  'TVDSLGPTCDPTCHDOWGPS',
  'DCPGTLDSVPTDGSTDHCPS',
];

// Paylines ------------------------------------------------------------------

export interface PayLine {
  name: string;
  /** The row (0 top, 2 bottom) the line crosses on each reel. */
  rows: readonly number[];
}

export const LINES: readonly PayLine[] = [
  { name: 'Middle', rows: [1, 1, 1, 1, 1] },
  { name: 'Top', rows: [0, 0, 0, 0, 0] },
  { name: 'Bottom', rows: [2, 2, 2, 2, 2] },
  { name: 'V', rows: [0, 1, 2, 1, 0] },
  { name: 'Peak', rows: [2, 1, 0, 1, 2] },
  { name: 'W', rows: [0, 2, 1, 2, 0] },
  { name: 'M', rows: [2, 0, 1, 0, 2] },
  { name: 'Slide down', rows: [0, 0, 1, 2, 2] },
  { name: 'Slide up', rows: [2, 2, 1, 0, 0] },
  { name: 'Hat', rows: [1, 0, 0, 0, 1] },
  { name: 'Bowl', rows: [1, 2, 2, 2, 1] },
  { name: 'Smile', rows: [0, 1, 1, 1, 0] },
  { name: 'Frown', rows: [2, 1, 1, 1, 2] },
  { name: 'Saw', rows: [0, 2, 0, 2, 0] },
  { name: 'Back saw', rows: [2, 0, 2, 0, 2] },
  { name: 'Zig', rows: [0, 1, 0, 1, 0] },
  { name: 'Zag', rows: [2, 1, 2, 1, 2] },
  { name: 'Ripple', rows: [1, 0, 1, 2, 1] },
  { name: 'Back ripple', rows: [1, 2, 1, 0, 1] },
  { name: 'Lightning', rows: [1, 0, 2, 0, 1] },
];

/** A line bet is the bet over this many. */
export const LINE_COUNT = LINES.length;
/** The most a spin can be worth, in line bets. */
export const MAX_UNITS = MAX_WIN * LINE_COUNT;

// Orb effects ---------------------------------------------------------------

export interface OrbEffect {
  op: 'add' | 'mul';
  /** For add: bets added to the win. For mul: what the win is multiplied by. */
  value: number;
  /** Chance, relative to the others. */
  weight: number;
}

/** What a bounce can do to the spin's win. */
export const ORB_EFFECTS: readonly OrbEffect[] = [
  { op: 'add', value: 0.25, weight: 3800 },
  { op: 'add', value: 0.5, weight: 2000 },
  { op: 'add', value: 1, weight: 400 },
  { op: 'mul', value: 2, weight: 900 },
  { op: 'mul', value: 3, weight: 300 },
  { op: 'mul', value: 5, weight: 120 },
  { op: 'mul', value: 10, weight: 35 },
  { op: 'mul', value: 25, weight: 4 },
];

export const ORB_WEIGHT = ORB_EFFECTS.reduce((s, e) => s + e.weight, 0);

/** What an effect does to a win, in line bets (capped at MAX_UNITS). */
export const applyEffect = (units: number, e: Pick<OrbEffect, 'op' | 'value'>): number => Math.min(MAX_UNITS, e.op === 'add' ? units + Math.round(e.value * LINE_COUNT) : units * e.value);

/** Which effect a roll in [0, 1) picks. */
export function pickEffect(u: number): OrbEffect {
  let x = u * ORB_WEIGHT;
  for (const e of ORB_EFFECTS) {
    x -= e.weight;
    if (x < 0) return e;
  }
  return ORB_EFFECTS[ORB_EFFECTS.length - 1];
}

// Reading a grid ------------------------------------------------------------

const IDS = SYMBOLS.map((s) => s.id);
const IX = Object.fromEntries(IDS.map((id, i) => [id, i])) as Record<SlotSymbol, number>;
const WILD = IX.wild;
const ORB = IX.orb;
const TOP = IX.hammy;
const PAYS: readonly (readonly [number, number, number] | null)[] = SYMBOLS.map((s) => s.pays);
const STRIP_IX: readonly Uint8Array[] = STRIPS.map((s) => Uint8Array.from(s, (ch) => SYMBOLS.findIndex((d) => d.ch === ch)));
const LINE_CELLS: readonly number[][] = LINES.map((l) => l.rows.map((row, reel) => reel * ROWS + row));

export const stripLength = (reel: number): number => STRIPS[reel].length;

/** Every possible stop of a reel. */
export const STOPS: readonly number[] = STRIPS.map((s) => s.length);

/** The symbols a reel shows when it stops at `stop`, top to bottom, as numbers (index into SYMBOLS). */
export function windowOf(reel: number, stop: number): number[] {
  const strip = STRIP_IX[reel];
  return Array.from({ length: ROWS }, (_, row) => strip[(stop + row) % strip.length]);
}

/** The numbers for a stop on each reel, reel by reel and row by row: cells[reel * ROWS + row]. */
export function cellsOf(stops: readonly number[]): Uint8Array {
  const cells = new Uint8Array(REELS * ROWS);
  for (let r = 0; r < REELS; r++) {
    const strip = STRIP_IX[r];
    for (let row = 0; row < ROWS; row++) cells[r * ROWS + row] = strip[(stops[r] + row) % strip.length];
  }
  return cells;
}

/**
 * What one payline pays (in line bets) on these cells, and how far it runs.
 * Matching starts on the left; the wild matches anything but the orb; the
 * orb breaks a line.
 */
export function runOf(cells: ArrayLike<number>, line: readonly number[]): { symbol: number; count: number; pay: number } {
  let target = -1;
  let count = 0;
  for (const cell of line) {
    const c = cells[cell];
    if (c === ORB) break;
    if (c === WILD) count++;
    else if (target < 0) {
      target = c;
      count++;
    } else if (c === target) count++;
    else break;
  }
  if (target < 0) target = TOP; // a line of nothing but wilds
  const pays = PAYS[target];
  return { symbol: target, count, pay: pays && count >= 3 ? pays[count - 3] : 0 };
}

/** The line bets a grid pays, summed over every line. The fast path the maths uses. */
export function scoreCells(cells: ArrayLike<number>): number {
  let units = 0;
  for (const line of LINE_CELLS) units += runOf(cells, line).pay;
  return units;
}

export const orbsIn = (cells: ArrayLike<number>): number => {
  let n = 0;
  for (let i = 0; i < REELS * ROWS; i++) if (cells[i] === ORB) n++;
  return n;
};

// A spin --------------------------------------------------------------------

export interface LineWin {
  /** Index into LINES. */
  line: number;
  symbol: SlotSymbol;
  /** How many matched, from the left. */
  count: number;
  /** In line bets. */
  units: number;
  /** As a multiple of the whole bet. */
  mult: number;
  /** Where the winning symbols are: [reel, row]. */
  cells: [number, number][];
}

export interface OrbHit {
  reel: number;
  row: number;
  op: 'add' | 'mul';
  value: number;
  /** What the spin is worth after this hit, as a multiple of the bet. */
  after: number;
}

export interface OrbBall {
  /** Where it came out of: an orb on the grid, or null for Hammy's sneeze. */
  from: { reel: number; row: number } | null;
  hits: OrbHit[];
}

export interface OrbFeature {
  balls: OrbBall[];
  /** What the lines paid before the orb, as a multiple of the bet. */
  base: number;
}

export interface SlotSpin {
  stops: number[];
  /** [reel][row] */
  grid: SlotSymbol[][];
  wins: LineWin[];
  /** Orbs on the grid. */
  orbs: number;
  sneeze: boolean;
  /** What the lines paid, as a multiple of the bet. */
  lines: number;
  feature: OrbFeature | null;
  /** The whole spin, as a multiple of the bet, after the cap. */
  mult: number;
  /** In line bets (an integer), after the cap. */
  units: number;
  capped: boolean;
}

export const gridOf = (stops: readonly number[]): SlotSymbol[][] => {
  const cells = cellsOf(stops);
  return Array.from({ length: REELS }, (_, r) => Array.from({ length: ROWS }, (_, row) => IDS[cells[r * ROWS + row]]));
};

/** Every line that pays on these stops, in line order. */
export function lineWins(stops: readonly number[]): LineWin[] {
  const cells = cellsOf(stops);
  const wins: LineWin[] = [];
  LINES.forEach((l, i) => {
    const run = runOf(cells, LINE_CELLS[i]);
    if (!run.pay) return;
    wins.push({
      line: i,
      symbol: IDS[run.symbol],
      count: run.count,
      units: run.pay,
      mult: run.pay / LINE_COUNT,
      cells: l.rows.slice(0, run.count).map((row, reel) => [reel, row] as [number, number]),
    });
  });
  return wins;
}

/** The cells the ball bounces off, starting from where it came out. It zig-zags: diagonally, off the edges, now and then turning round. */
function bouncePath(from: { reel: number; row: number } | null, hits: number, roll: Roll): { reel: number; row: number }[] {
  let reel = from ? from.reel : Math.floor(roll() * REELS);
  let row = from ? from.row : 0;
  let dx = roll() < 0.5 ? -1 : 1;
  let dy = from ? (row === 0 ? 1 : row === ROWS - 1 ? -1 : roll() < 0.5 ? -1 : 1) : 1;
  const path: { reel: number; row: number }[] = [];
  for (let i = 0; i < hits; i++) {
    if (roll() < 0.2) dx = -dx;
    if (reel + dx < 0 || reel + dx >= REELS) dx = -dx;
    if (row + dy < 0 || row + dy >= ROWS) dy = -dy;
    reel += dx;
    row += dy;
    path.push({ reel, row });
  }
  return path;
}

/** Roll one ball's bounces, starting from a win of `units` line bets. */
function rollBall(from: { reel: number; row: number } | null, units: number, roll: Roll): { ball: OrbBall; units: number } {
  const path = bouncePath(from, ORB_HITS, roll);
  const hits: OrbHit[] = [];
  for (const p of path) {
    const e = pickEffect(roll());
    units = applyEffect(units, e);
    hits.push({ reel: p.reel, row: p.row, op: e.op, value: e.value, after: units / LINE_COUNT });
  }
  return { ball: { from, hits }, units };
}

/**
 * Spin. Everything about it is decided here: where the reels stop, which
 * lines pay, whether the orb flies and what each bounce does. `roll` gives
 * numbers in [0, 1).
 */
export function spin(roll: Roll): SlotSpin {
  const stops = STRIPS.map((s) => Math.min(s.length - 1, Math.floor(roll() * s.length)));
  const sneeze = roll() * SNEEZE_ONE_IN < 1;
  const cells = cellsOf(stops);
  const grid = gridOf(stops);
  const wins = lineWins(stops);
  const lineUnits = wins.reduce((s, w) => s + w.units, 0);
  const orbCells: { reel: number; row: number }[] = [];
  for (let reel = 0; reel < REELS; reel++) for (let row = 0; row < ROWS; row++) if (cells[reel * ROWS + row] === ORB) orbCells.push({ reel, row });

  let feature: OrbFeature | null = null;
  let units = Math.min(lineUnits, MAX_UNITS);
  let capped = lineUnits > MAX_UNITS;
  // A sneeze only counts when the orbs on the grid haven't already gone off.
  const sneezed = sneeze && orbCells.length < ORB_TRIGGER;
  if (orbCells.length >= ORB_TRIGGER || sneezed) {
    const sources: ({ reel: number; row: number } | null)[] = [...orbCells];
    if (sneezed) sources.push(null);
    const balls: OrbBall[] = [];
    for (const from of sources) {
      const r = rollBall(from, units, roll);
      balls.push(r.ball);
      units = r.units;
    }
    feature = { balls, base: lineUnits / LINE_COUNT };
    capped = units >= MAX_UNITS;
  }
  return { stops, grid, wins, orbs: orbCells.length, sneeze, lines: lineUnits / LINE_COUNT, feature, mult: units / LINE_COUNT, units, capped };
}

/** One orb on the grid and nothing won: it nearly went off. */
export const isNearMiss = (s: SlotSpin): boolean => s.orbs === 1 && !s.feature && s.units === 0;

/**
 * The multiplier to hand to the wallet's payOut for a spin, so that
 * floor(bet × it) is exactly the coins the spin earned (floating point can
 * land a hair under a whole number).
 */
export function payMultiplier(bet: number, units: number): number {
  const coins = Math.floor((bet * units) / LINE_COUNT);
  const m = units / LINE_COUNT;
  return Math.floor(bet * m) === coins ? m : (coins + 0.5) / bet;
}

// What Hammy says -----------------------------------------------------------

export const SLOTS_BIG: readonly string[] = ['THE MACHINE IS BREAKING', 'I can’t feel my hands', 'Call Grandma!', 'Frame this. Frame the whole machine.', 'Dr. Moss, check this out!'];
export const SLOTS_WIN: readonly string[] = ['Ka-ching, baby.', 'Dorkitos for everyone.', 'Told you.', 'Nice. Do it again.', 'Ooh, shiny.'];
export const SLOTS_ORB: readonly string[] = ['The ORB!', 'Hold on to something.', 'It’s loose. IT’S LOOSE.', 'Pinball time.', 'Don’t touch the glass.'];
export const SLOTS_SNEEZE: readonly string[] = ['Ah… ah… AH-CHOO!', 'Sorry. Allergies. Look, an orb!', 'Bless me.', 'That one came from deep inside.'];
export const SLOTS_NEAR: readonly string[] = ['One orb. So close.', 'The orb’s lonely. Get it a friend.', 'Almost. Spin again.', 'It heard you. It’s thinking about it.'];
export const SLOTS_DRY: readonly string[] = ['Nothing. I felt that in my cube.', 'The machine is shy today.', 'Spin again, it’s due.', 'Somewhere, a seagull is laughing.', 'That one was just for show.'];
export const SLOTS_BROKE: readonly string[] = ['Out of coins. Check the couch.', 'The machine ate everything. It was hungry.', 'I’d lend you some, but I’m a cube.'];
export const SLOTS_START = 'Five reels, twenty zig-zag lines, one very bouncy orb. Spin it.';
