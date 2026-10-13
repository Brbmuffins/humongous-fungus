// The forest market. Prices move every few seconds, including while the game
// is closed, from a seeded random walk stored in the save (so reloading never
// rerolls a price). Holdings rot at each good's own rate.
//
// Prices are an index. Buying costs index × scale, where scale is your current
// production per second, and each purchase remembers the scale it was bought
// at ("units"). Selling pays index × units, so profit comes only from price
// moves, never from your jar having grown in the meantime.
import {
  GOODS,
  GOOD_BY_ID,
  GOOD_IDS,
  MARKET_HISTORY,
  MARKET_MAX_CATCHUP_TICKS,
  MARKET_SPREAD,
  MARKET_TICK_MS,
  MOODS,
  ROT_SALVAGE,
  type GoodDef,
  type GoodId,
  type Mood,
} from './defs';
import { rngStep } from './rng';

export interface GoodState {
  price: number;
  mood: Mood;
  moodLeft: number;
  history: number[];
  /** Amount held (fractional while rotting). */
  held: number;
  /** Sum of amount × scale at purchase; sale value is price × units. */
  units: number;
  /** Nutrients paid for what is still held. */
  paid: number;
}

export interface MarketState {
  rng: number;
  /** Wall-clock ms of the last price change. */
  tickAt: number;
  goods: Record<GoodId, GoodState>;
}

export interface MarketSummary {
  ticks: number;
  /** Amount of each good lost to rot. */
  rotted: Partial<Record<GoodId, number>>;
  /** Nutrients digested from rotten stock. */
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

function pickMood(m: MarketState, def: GoodDef): Mood {
  const total = MOOD_NAMES.reduce((sum, k) => sum + def.moods[k], 0);
  let r = random(m) * total;
  for (const k of MOOD_NAMES) {
    r -= def.moods[k];
    if (r <= 0) return k;
  }
  return 'calm';
}

function moodTicks(m: MarketState, def: GoodDef): number {
  return Math.round((20 + random(m) * 140) * def.moodLength);
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Advance one good by one tick. Returns the share of stock that rotted. */
function tickGood(m: MarketState, def: GoodDef, g: GoodState): number {
  if (g.moodLeft <= 0) {
    g.mood = pickMood(m, def);
    g.moodLeft = moodTicks(m, def);
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
  return def.rotPerHour > 0 ? 1 - (1 - def.rotPerHour) ** (MARKET_TICK_MS / 3_600_000) : 0;
}

export function newMarket(now: number, seed: number): MarketState {
  const m: MarketState = { rng: (seed * 2654435761) >>> 0, tickAt: now, goods: {} as Record<GoodId, GoodState> };
  for (const def of GOODS) {
    m.goods[def.id] = {
      price: round(def.mean * (0.75 + random(m) * 0.5)),
      mood: 'calm',
      moodLeft: 0,
      history: [],
      held: 0,
      units: 0,
      paid: 0,
    };
  }
  // Fill the chart so the market opens mid-story rather than flat.
  for (let i = 0; i < MARKET_HISTORY; i++) for (const def of GOODS) tickGood(m, def, m.goods[def.id]);
  return m;
}

/** Bring prices up to `now`, rotting holdings along the way. */
export function stepMarket(m: MarketState, now: number): MarketSummary {
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
  for (let i = 0; i < ticks; i++) {
    for (const def of GOODS) {
      const g = m.goods[def.id];
      const rot = tickGood(m, def, g);
      if (rot > 0 && g.held > 0) {
        const lost = g.held * rot;
        summary.salvage += g.price * g.units * rot * ROT_SALVAGE;
        summary.rotted[def.id] = (summary.rotted[def.id] ?? 0) + lost;
        g.held -= lost;
        g.units -= g.units * rot;
        g.paid -= g.paid * rot;
        if (g.held < 1e-6) clearHolding(g);
      }
    }
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
// Trading. `scale` is nutrients per index point right now (your production).

export function buyPrice(m: MarketState, id: GoodId, scale: number): number {
  return m.goods[id].price * scale;
}

export function maxBuy(m: MarketState, id: GoodId, scale: number, budget: number): number {
  const g = m.goods[id];
  const room = Math.floor(GOOD_BY_ID[id].cap - g.held + 1e-9);
  return Math.max(0, Math.min(room, Math.floor(budget / buyPrice(m, id, scale))));
}

/** Returns the nutrients spent, or 0 if the purchase is not possible. */
export function buyGood(m: MarketState, id: GoodId, amount: number, scale: number, budget: number): number {
  const n = Math.min(Math.floor(amount), maxBuy(m, id, scale, budget));
  if (n < 1) return 0;
  const g = m.goods[id];
  const cost = n * buyPrice(m, id, scale);
  g.held += n;
  g.units += n * scale;
  g.paid += cost;
  return cost;
}

/** What selling `amount` would pay right now, after the market's cut. */
export function saleValue(m: MarketState, id: GoodId, amount: number): number {
  const g = m.goods[id];
  if (g.held <= 0) return 0;
  const share = Math.min(1, amount / g.held);
  return g.price * g.units * share * (1 - MARKET_SPREAD);
}

/** Sell up to `amount`. Returns the nutrients received and the profit over cost. */
export function sellGood(m: MarketState, id: GoodId, amount: number): { value: number; profit: number } {
  const g = m.goods[id];
  if (g.held <= 0 || amount <= 0) return { value: 0, profit: 0 };
  const share = Math.min(1, amount / g.held);
  const value = saleValue(m, id, amount);
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
export function holdingChange(m: MarketState, id: GoodId): number | null {
  const g = m.goods[id];
  if (g.held <= 0 || g.paid <= 0) return null;
  return saleValue(m, id, g.held) / g.paid - 1;
}

/** The average price index paid for what is held. */
export function paidIndex(m: MarketState, id: GoodId): number | null {
  const g = m.goods[id];
  return g.units > 0 ? g.paid / g.units : null;
}

/** Price change over the chart window, as a fraction. */
export function windowChange(m: MarketState, id: GoodId): number {
  const h = m.goods[id].history;
  return h.length > 1 ? h[h.length - 1] / h[0] - 1 : 0;
}

// ---------------------------------------------------------------------------
// Saves

const MOOD_SET = new Set<string>(MOOD_NAMES);
const fin = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function deserializeMarket(raw: unknown, now: number, seed: number): MarketState {
  const fresh = newMarket(now, seed);
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Record<string, unknown>;
  const goods = (r.goods && typeof r.goods === 'object' ? r.goods : {}) as Record<string, unknown>;
  const m: MarketState = {
    rng: Math.floor(fin(r.rng, fresh.rng)) >>> 0,
    tickAt: Math.min(now, fin(r.tickAt, now)),
    goods: {} as Record<GoodId, GoodState>,
  };
  for (const id of GOOD_IDS) {
    const def = GOOD_BY_ID[id];
    const g = (goods[id] && typeof goods[id] === 'object' ? goods[id] : null) as Record<string, unknown> | null;
    if (!g) {
      m.goods[id] = fresh.goods[id];
      continue;
    }
    const price = fin(g.price, 0);
    const history = Array.isArray(g.history)
      ? g.history.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0).slice(-MARKET_HISTORY)
      : [];
    const held = Math.min(def.cap, Math.max(0, fin(g.held, 0)));
    m.goods[id] = {
      price: price > 0 ? price : fresh.goods[id].price,
      mood: typeof g.mood === 'string' && MOOD_SET.has(g.mood) ? (g.mood as Mood) : 'calm',
      moodLeft: Math.max(0, Math.floor(fin(g.moodLeft, 0))),
      history: history.length ? history : fresh.goods[id].history,
      held,
      units: held > 0 ? Math.max(0, fin(g.units, 0)) : 0,
      paid: held > 0 ? Math.max(0, fin(g.paid, 0)) : 0,
    };
  }
  return m;
}
