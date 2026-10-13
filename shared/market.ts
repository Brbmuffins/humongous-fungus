// A live market engine. Prices move every few seconds, including while the
// game is closed, from a seeded random walk stored in the save (so reloading
// never rerolls a price). Holdings rot at each good's own rate.
//
// Prices are an index. Buying costs index × scale, and each purchase
// remembers the scale it was bought at ("units"). Selling pays index × units,
// so a game that scales prices with the player's economy only pays out for
// price moves. A game with fixed prices just uses scale 1.
import { rngStep } from './rng';

export type Mood = 'calm' | 'rising' | 'falling' | 'boom' | 'crash' | 'wild';

export interface MarketGoodDef {
  id: string;
  /** Long-run average price index. */
  mean: number;
  /** Random swing per tick (log scale). */
  vol: number;
  /** Pull back toward the mean per tick. */
  revert: number;
  /** Share of held stock that rots per hour. */
  rotPerHour: number;
  /** Most you can hold, before any game multiplier. */
  cap: number;
  /** How long moods last, relative to the base. */
  moodLength: number;
  moods: Record<Mood, number>;
}

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

export interface GoodState {
  price: number;
  mood: Mood;
  moodLeft: number;
  history: number[];
  /** Amount held (fractional while rotting). */
  held: number;
  /** Sum of amount × scale at purchase; sale value is price × units. */
  units: number;
  /** What was paid for what is still held. */
  paid: number;
}

export interface MarketState {
  rng: number;
  /** Wall-clock ms of the last price change. */
  tickAt: number;
  goods: Record<string, GoodState>;
}

export interface StepOptions {
  /** Multiplies every good's rot rate (cool cellars, say). */
  rotMult?: number;
  /** Rotten stock is worth this share of its value (paid out as salvage). */
  salvage?: number;
  /** Called when a good's mood changes, with the tick's wall-clock time. */
  onMood?: (id: string, mood: Mood, at: number) => void;
}

export interface MarketSummary {
  ticks: number;
  /** Amount of each good lost to rot. */
  rotted: Record<string, number>;
  /** Value recovered from rotten stock. */
  salvage: number;
}

const MOOD_NAMES = Object.keys(MOODS) as Mood[];

function random(m: MarketState): number {
  const [next, value] = rngStep(m.rng);
  m.rng = next;
  return value;
}

function gaussian(m: MarketState): number {
  const u = Math.max(1e-12, random(m));
  const v = random(m);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pickMood(m: MarketState, def: MarketGoodDef): Mood {
  const total = MOOD_NAMES.reduce((sum, k) => sum + def.moods[k], 0);
  let r = random(m) * total;
  for (const k of MOOD_NAMES) {
    r -= def.moods[k];
    if (r <= 0) return k;
  }
  return 'calm';
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Advance one good by one tick. Returns true if its mood changed. */
function tickGood(m: MarketState, def: MarketGoodDef, g: GoodState): boolean {
  let changed = false;
  if (g.moodLeft <= 0) {
    const before = g.mood;
    g.mood = pickMood(m, def);
    g.moodLeft = Math.round((20 + random(m) * 140) * def.moodLength);
    changed = g.mood !== before;
  }
  g.moodLeft -= 1;
  const mood = MOODS[g.mood];
  const drift = mood.drift * (def.vol / 0.01);
  const d = drift + def.revert * Math.log(def.mean / g.price) + def.vol * mood.vol * gaussian(m);
  const lo = def.mean * 0.2;
  const hi = def.mean * 5;
  let price = g.price * Math.exp(d);
  if (price <= lo || price >= hi) {
    price = Math.min(hi, Math.max(lo, price));
    g.mood = 'calm';
  }
  g.price = round(price);
  g.history.push(g.price);
  if (g.history.length > MARKET_HISTORY) g.history.splice(0, g.history.length - MARKET_HISTORY);
  return changed;
}

function emptyGood(price: number): GoodState {
  return { price, mood: 'calm', moodLeft: 0, history: [], held: 0, units: 0, paid: 0 };
}

export function newMarket(goods: readonly MarketGoodDef[], now: number, seed: number): MarketState {
  const m: MarketState = { rng: (seed * 2654435761) >>> 0, tickAt: now, goods: {} };
  for (const def of goods) m.goods[def.id] = emptyGood(round(def.mean * (0.75 + random(m) * 0.5)));
  // Fill the chart so the market opens mid-story rather than flat.
  for (let i = 0; i < MARKET_HISTORY; i++) for (const def of goods) tickGood(m, def, m.goods[def.id]);
  return m;
}

/** Bring prices up to `now`, rotting holdings along the way. */
export function stepMarket(
  m: MarketState,
  goods: readonly MarketGoodDef[],
  now: number,
  opts: StepOptions = {},
): MarketSummary {
  const summary: MarketSummary = { ticks: 0, rotted: {}, salvage: 0 };
  if (now < m.tickAt) {
    m.tickAt = now;
    return summary;
  }
  let ticks = Math.floor((now - m.tickAt) / MARKET_TICK_MS);
  if (ticks <= 0) return summary;
  if (ticks > MARKET_MAX_CATCHUP_TICKS) {
    m.tickAt += (ticks - MARKET_MAX_CATCHUP_TICKS) * MARKET_TICK_MS;
    ticks = MARKET_MAX_CATCHUP_TICKS;
  }
  const rotMult = opts.rotMult ?? 1;
  const salvage = opts.salvage ?? 0;
  const rots = goods.map((def) =>
    def.rotPerHour > 0 ? 1 - (1 - Math.min(1, def.rotPerHour * rotMult)) ** (MARKET_TICK_MS / 3_600_000) : 0,
  );
  for (let i = 0; i < ticks; i++) {
    const at = m.tickAt + (i + 1) * MARKET_TICK_MS;
    goods.forEach((def, k) => {
      const g = m.goods[def.id];
      if (tickGood(m, def, g)) opts.onMood?.(def.id, g.mood, at);
      const rot = rots[k];
      if (rot > 0 && g.held > 0) {
        const lost = g.held * rot;
        summary.salvage += g.price * g.units * rot * salvage;
        summary.rotted[def.id] = (summary.rotted[def.id] ?? 0) + lost;
        g.held -= lost;
        g.units -= g.units * rot;
        g.paid -= g.paid * rot;
        if (g.held < 1e-6) clearHolding(g);
      }
    });
  }
  m.tickAt += ticks * MARKET_TICK_MS;
  summary.ticks = ticks;
  return summary;
}

export function clearHolding(g: GoodState): void {
  g.held = 0;
  g.units = 0;
  g.paid = 0;
}

// ---------------------------------------------------------------------------
// Trading

export function buyPrice(m: MarketState, id: string, scale = 1): number {
  return m.goods[id].price * scale;
}

/** The most `budget` can buy, within the storage limit `cap`. */
export function maxBuy(m: MarketState, id: string, cap: number, budget: number, scale = 1): number {
  const g = m.goods[id];
  const room = Math.floor(cap - g.held + 1e-9);
  return Math.max(0, Math.min(room, Math.floor(budget / buyPrice(m, id, scale))));
}

/** Returns what was spent, or 0 if the purchase is not possible. */
export function buyGood(m: MarketState, id: string, amount: number, cap: number, budget: number, scale = 1): number {
  const n = Math.min(Math.floor(amount), maxBuy(m, id, cap, budget, scale));
  if (n < 1) return 0;
  const g = m.goods[id];
  const cost = n * buyPrice(m, id, scale);
  g.held += n;
  g.units += n * scale;
  g.paid += cost;
  return cost;
}

/** What selling `amount` would pay right now, after the market's cut. */
export function saleValue(m: MarketState, id: string, amount: number, spread: number): number {
  const g = m.goods[id];
  if (g.held <= 0) return 0;
  const share = Math.min(1, amount / g.held);
  return g.price * g.units * share * (1 - spread);
}

/** Sell up to `amount`. Returns what was received and the profit over cost. */
export function sellGood(m: MarketState, id: string, amount: number, spread: number): { value: number; profit: number } {
  const g = m.goods[id];
  if (g.held <= 0 || amount <= 0) return { value: 0, profit: 0 };
  const share = Math.min(1, amount / g.held);
  const value = saleValue(m, id, amount, spread);
  const cost = g.paid * share;
  if (share >= 1 - 1e-9) clearHolding(g);
  else {
    g.held -= g.held * share;
    g.units -= g.units * share;
    g.paid -= cost;
  }
  return { value, profit: value - cost };
}

/** Gain or loss on what is held if it were all sold now, as a fraction of cost. */
export function holdingChange(m: MarketState, id: string, spread: number): number | null {
  const g = m.goods[id];
  if (g.held <= 0 || g.paid <= 0) return null;
  return saleValue(m, id, g.held, spread) / g.paid - 1;
}

/** The average price index paid for what is held. */
export function paidIndex(m: MarketState, id: string): number | null {
  const g = m.goods[id];
  return g.units > 0 ? g.paid / g.units : null;
}

/** Price change over the chart window, as a fraction. */
export function windowChange(m: MarketState, id: string): number {
  const h = m.goods[id].history;
  return h.length > 1 ? h[h.length - 1] / h[0] - 1 : 0;
}

// ---------------------------------------------------------------------------
// Saves

const MOOD_SET = new Set<string>(MOOD_NAMES);
const fin = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Parse a saved market, repairing anything damaged and adding new goods. */
export function deserializeMarket(raw: unknown, goods: readonly MarketGoodDef[], now: number, seed: number): MarketState {
  const fresh = newMarket(goods, now, seed);
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Record<string, unknown>;
  const saved = (r.goods && typeof r.goods === 'object' ? r.goods : {}) as Record<string, unknown>;
  const m: MarketState = {
    rng: Math.floor(fin(r.rng, fresh.rng)) >>> 0,
    tickAt: Math.min(now, fin(r.tickAt, now)),
    goods: {},
  };
  for (const def of goods) {
    const g = (saved[def.id] && typeof saved[def.id] === 'object' ? saved[def.id] : null) as Record<string, unknown> | null;
    if (!g) {
      m.goods[def.id] = fresh.goods[def.id];
      continue;
    }
    const price = fin(g.price, 0);
    const history = Array.isArray(g.history)
      ? g.history.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0).slice(-MARKET_HISTORY)
      : [];
    const held = Math.max(0, fin(g.held, 0));
    m.goods[def.id] = {
      price: price > 0 ? price : fresh.goods[def.id].price,
      mood: typeof g.mood === 'string' && MOOD_SET.has(g.mood) ? (g.mood as Mood) : 'calm',
      moodLeft: Math.max(0, Math.floor(fin(g.moodLeft, 0))),
      history: history.length ? history : fresh.goods[def.id].history,
      held,
      units: held > 0 ? Math.max(0, fin(g.units, 0)) : 0,
      paid: held > 0 ? Math.max(0, fin(g.paid, 0)) : 0,
    };
  }
  return m;
}
