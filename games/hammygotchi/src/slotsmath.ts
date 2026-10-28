// Hammy Slots' payback, worked out exactly. Not used by the game: the tests
// and scripts/slots-analysis.ts run it to prove the reels, the pay table and
// the orb pay back what arcade.ts promises (RTP).
//
// Every combination of stops is walked (about four million), giving how often
// each line win comes with each number of orbs on the grid. The orb's
// bounces don't depend on the grid (they're rolled from the orb's own
// table), so their odds come from a small sum over the bounces, and the two
// are combined, cap and all.
import {
  LINE_COUNT,
  MAX_UNITS,
  ORB_EFFECTS,
  ORB_HITS,
  ORB_TRIGGER,
  ORB_WEIGHT,
  REELS,
  ROWS,
  SNEEZE_ONE_IN,
  STRIPS,
  orbsIn,
  scoreCells,
  windowOf,
} from './slots';

/**
 * What the orb does to a win, as odds. Every bounce either adds some line
 * bets or multiplies, so after any run of bounces the spin is worth
 * `a × (the line win) + b` line bets, whatever the line win was. This gives
 * every (a, b) the orb can end on and its chance, for `balls` balls. Values
 * past the cap are clamped, which changes nothing once the cap is applied.
 */
export function orbOdds(balls: number): { a: number; b: number; p: number }[] {
  let dist = new Map<string, { a: number; b: number; p: number }>([['1,0', { a: 1, b: 0, p: 1 }]]);
  for (let i = 0; i < balls * ORB_HITS; i++) {
    const next = new Map<string, { a: number; b: number; p: number }>();
    for (const s of dist.values()) {
      for (const e of ORB_EFFECTS) {
        const a = e.op === 'mul' ? Math.min(MAX_UNITS + 1, s.a * e.value) : s.a;
        const b = e.op === 'mul' ? Math.min(MAX_UNITS, s.b * e.value) : Math.min(MAX_UNITS, s.b + Math.round(e.value * LINE_COUNT));
        const key = `${a},${b}`;
        const p = (s.p * e.weight) / ORB_WEIGHT;
        const have = next.get(key);
        if (have) have.p += p;
        else next.set(key, { a, b, p });
      }
    }
    dist = next;
  }
  return [...dist.values()];
}

/** For each number of orbs on the grid: how many stop combinations give each line win (in line bets). */
export function enumerateGrids(): { total: number; byOrbs: Map<number, number>[] } {
  const byOrbs: Map<number, number>[] = Array.from({ length: REELS * ROWS + 1 }, () => new Map());
  const windows = STRIPS.map((s, r) => Array.from({ length: s.length }, (_, stop) => windowOf(r, stop)));
  const cells = new Uint8Array(REELS * ROWS);
  const put = (r: number, stop: number) => {
    const w = windows[r][stop];
    for (let row = 0; row < ROWS; row++) cells[r * ROWS + row] = w[row];
  };
  let total = 0;
  const n = STRIPS.map((s) => s.length);
  for (let a = 0; a < n[0]; a++) {
    put(0, a);
    for (let b = 0; b < n[1]; b++) {
      put(1, b);
      for (let c = 0; c < n[2]; c++) {
        put(2, c);
        for (let d = 0; d < n[3]; d++) {
          put(3, d);
          for (let e = 0; e < n[4]; e++) {
            put(4, e);
            const hist = byOrbs[orbsIn(cells)];
            const u = scoreCells(cells);
            hist.set(u, (hist.get(u) ?? 0) + 1);
            total++;
          }
        }
      }
    }
  }
  return { total, byOrbs };
}

export interface Analysis {
  /** What a bet comes back as, on average, after the cap. */
  rtp: number;
  /** Of that, what the lines pay on spins without the orb. */
  rtpLines: number;
  /** And what spins with the orb pay (the lines plus whatever the orb does to them). */
  rtpOrb: number;
  /** The chance a spin pays anything at all. */
  hit: number;
  /** The chance a line pays (before any orb). */
  lineHit: number;
  /** The chance a spin pays at least the bet back. */
  hitBet: number;
  /** The chance the orb flies. */
  orb: number;
  /** The biggest a spin could pay, before the cap, and the chance of the cap. */
  maxUncapped: number;
  capChance: number;
  /** The most it can pay, as a multiple of the bet. */
  maxWin: number;
  /** The chance a spin pays at least 1×, 10×, 50× (huge), 100×, 250× (Hammy win) and 1000× the bet. */
  atLeast: Record<number, number>;
  /** The standard deviation of a spin's payout, in bets. */
  sd: number;
  combos: number;
}

export function analyse(): Analysis {
  const { total, byOrbs } = enumerateGrids();
  const odds = new Map<number, { a: number; b: number; p: number }[]>();
  const orbs = (balls: number) => {
    let d = odds.get(balls);
    if (!d) odds.set(balls, (d = orbOdds(balls)));
    return d;
  };
  const sneezeP = 1 / SNEEZE_ONE_IN;
  const thresholds = [1, 10, 50, 100, 250, 1000];
  const atLeast: Record<number, number> = Object.fromEntries(thresholds.map((t) => [t, 0]));
  let rtp = 0;
  let rtpLines = 0;
  let hit = 0;
  let lineHit = 0;
  let orbP = 0;
  let capChance = 0;
  let maxUncapped = 0;
  let second = 0;

  const take = (p: number, units: number) => {
    const capped = Math.min(units, MAX_UNITS);
    const x = capped / LINE_COUNT;
    rtp += p * x;
    second += p * x * x;
    if (units > 0) hit += p;
    if (units > MAX_UNITS) capChance += p;
    maxUncapped = Math.max(maxUncapped, units / LINE_COUNT);
    for (const t of thresholds) if (x >= t) atLeast[t] += p;
  };

  byOrbs.forEach((hist, k) => {
    for (const [units, count] of hist) {
      const p = count / total;
      if (units > 0) lineHit += p;
      // A sneeze only counts when the orbs on the grid haven't already gone off.
      for (const sneeze of k >= ORB_TRIGGER ? [false] : [false, true]) {
        const ps = k >= ORB_TRIGGER ? p : p * (sneeze ? sneezeP : 1 - sneezeP);
        const balls = k + (sneeze ? 1 : 0);
        if (k >= ORB_TRIGGER || sneeze) {
          orbP += ps;
          for (const o of orbs(balls)) take(ps * o.p, o.a * units + o.b);
        } else {
          take(ps, units);
          rtpLines += ps * (Math.min(units, MAX_UNITS) / LINE_COUNT);
        }
      }
    }
  });

  return {
    rtp,
    rtpLines,
    rtpOrb: rtp - rtpLines,
    hit,
    lineHit,
    hitBet: atLeast[1],
    orb: orbP,
    maxUncapped,
    capChance,
    maxWin: MAX_UNITS / LINE_COUNT,
    atLeast,
    sd: Math.sqrt(second - rtp * rtp),
    combos: total,
  };
}
