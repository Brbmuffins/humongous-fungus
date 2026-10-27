// Your career between days: the account, the tools you bought, settings and
// records. One JSON save. A day in progress is checkpointed, so closing the
// app mid-session settles the day at the last checkpoint instead of
// letting you replay a bad one.
import { mulberry32 } from '@shared/rng';
import {
  BASE_LEVERAGE,
  BASE_SLOTS,
  BLOWN_BELOW,
  DAY_LENGTHS,
  GOAL,
  SIZES,
  SQUAWK_LEAD,
  START_CASH,
  STOCK,
  STOCKS,
  STOP_CHOICES,
  TARGET_CHOICES,
  TOOL,
  rankFor,
  type DayLength,
  type SizeId,
  type StockId,
  type ToolId,
} from './defs';
import type { DeskOptions, Trade } from './desk';
import type { DaySetup } from './market';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  length: DayLength;
  size: SizeId;
  stop: number;
  target: number;
}

export interface DayRecord {
  day: number;
  pnl: number;
  /** P&L as a share of the day's starting equity. */
  pct: number;
  trades: number;
  wins: number;
}

export interface Stats {
  days: number;
  green: number;
  trades: number;
  wins: number;
  fees: number;
  bestDay: number;
  worstDay: number;
  bestTrade: number;
  worstTrade: number;
  goals: number;
  halts: number;
  peak: number;
  /** Accounts blown. */
  blown: number;
  bestStreak: number;
}

export interface Career {
  version: 1;
  seed: number;
  /** The next day to trade (1 is the first). */
  day: number;
  cash: number;
  tools: ToolId[];
  closes: Partial<Record<StockId, number>>;
  settings: Settings;
  history: DayRecord[];
  /** Green days in a row. */
  streak: number;
  stats: Stats;
  /** A session in progress: its day and last checkpointed equity. */
  live: { day: number; equity: number } | null;
  /** Coach tips already shown. */
  tips: string[];
  /** When it was last saved (to pick the newest copy across devices). */
  updatedAt: number;
}

const HISTORY = 30;

export function newStats(): Stats {
  return { days: 0, green: 0, trades: 0, wins: 0, fees: 0, bestDay: 0, worstDay: 0, bestTrade: 0, worstTrade: 0, goals: 0, halts: 0, peak: START_CASH, blown: 0, bestStreak: 0 };
}

export function newCareer(seed: number): Career {
  return {
    version: 1,
    seed: seed >>> 0,
    day: 1,
    cash: START_CASH,
    tools: [],
    closes: {},
    settings: { sound: true, haptics: true, length: 'normal', size: 'quarter', stop: 0.02, target: 0.04 },
    history: [],
    streak: 0,
    stats: newStats(),
    live: null,
    tips: [],
    updatedAt: 0,
  };
}

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Read a save, mending anything odd. Null if it isn't one of ours. */
export function loadCareer(raw: string | null): Career | null {
  if (!raw) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || o.version !== 1) return null;
  const c = newCareer(num(o.seed, 1));
  c.day = Math.floor(num(o.day, 1, 1));
  c.cash = num(o.cash, START_CASH, 0);
  if (Array.isArray(o.tools)) c.tools = o.tools.filter((t): t is ToolId => typeof t === 'string' && t in TOOL);
  if (o.closes && typeof o.closes === 'object') {
    for (const [id, v] of Object.entries(o.closes as Record<string, unknown>)) {
      if (id in STOCK && typeof v === 'number' && Number.isFinite(v) && v > 0) c.closes[id as StockId] = v;
    }
  }
  const s = (o.settings ?? {}) as Partial<Settings>;
  c.settings = {
    sound: s.sound !== false,
    haptics: s.haptics !== false,
    length: s.length && s.length in DAY_LENGTHS ? s.length : 'normal',
    size: s.size && s.size in SIZES ? s.size : 'quarter',
    stop: (STOP_CHOICES as readonly number[]).includes(s.stop as number) ? (s.stop as number) : 0.02,
    target: (TARGET_CHOICES as readonly number[]).includes(s.target as number) ? (s.target as number) : 0.04,
  };
  if (Array.isArray(o.history)) {
    c.history = o.history
      .filter((d): d is DayRecord => !!d && typeof d === 'object' && typeof (d as DayRecord).pnl === 'number')
      .slice(-HISTORY)
      .map((d) => ({ day: num(d.day, 0), pnl: num(d.pnl, 0), pct: num(d.pct, 0), trades: num(d.trades, 0, 0), wins: num(d.wins, 0, 0) }));
  }
  c.streak = Math.floor(num(o.streak, 0, 0));
  const st = (o.stats ?? {}) as Partial<Stats>;
  for (const k of Object.keys(c.stats) as (keyof Stats)[]) c.stats[k] = num(st[k], c.stats[k]);
  const live = o.live as Career['live'];
  c.live = live && typeof live === 'object' && typeof live.equity === 'number' && Number.isFinite(live.equity) ? { day: num(live.day, c.day), equity: Math.max(0, live.equity) } : null;
  if (Array.isArray(o.tips)) c.tips = o.tips.filter((t): t is string => typeof t === 'string').slice(0, 20);
  c.updatedAt = num(o.updatedAt, 0, 0);
  return c;
}

export const has = (c: Career, tool: ToolId): boolean => c.tools.includes(tool);

export function leverage(c: Career): number {
  return has(c, 'margin6') ? 6 : has(c, 'margin4') ? 4 : BASE_LEVERAGE;
}

export function slots(c: Career): number {
  return has(c, 'scanner') ? BASE_SLOTS + 2 : BASE_SLOTS;
}

/** Today's tickers: a fresh mix every day, never all sleepy or all wild. */
export function watchlist(c: Career, day = c.day): StockId[] {
  const r = mulberry32((c.seed ^ Math.imul(day, 0x85ebca6b)) >>> 0);
  const keyed = STOCKS.map((s) => ({ id: s.id, key: r() }));
  keyed.sort((a, b) => a.key - b.key);
  const ids = keyed.slice(0, slots(c)).map((x) => x.id);
  const spicy = (id: StockId) => STOCK[id].vol >= 0.08;
  // At least one wild one and one calm one.
  if (!ids.some(spicy)) ids[ids.length - 1] = keyed.find((x) => spicy(x.id))!.id;
  if (ids.every(spicy)) ids[0] = keyed.find((x) => !spicy(x.id))!.id;
  return ids;
}

export function setupFor(c: Career): DaySetup {
  return { seed: c.seed, day: c.day, ids: watchlist(c), closes: c.closes, lead: has(c, 'squawk') ? SQUAWK_LEAD : 0 };
}

export function deskOptions(c: Career): DeskOptions {
  return {
    leverage: leverage(c),
    feeMult: has(c, 'feecut') ? 0.5 : 1,
    brackets: has(c, 'brackets') ? { stop: c.settings.stop, target: c.settings.target } : null,
  };
}

export function canBuy(c: Career, tool: ToolId): 'ok' | 'owned' | 'needs' | 'cash' {
  const def = TOOL[tool];
  if (has(c, tool)) return 'owned';
  if (def.needs && !has(c, def.needs)) return 'needs';
  if (c.cash < def.cost) return 'cash';
  return 'ok';
}

/** Buy a tool with account cash. */
export function buyTool(c: Career, tool: ToolId): boolean {
  if (canBuy(c, tool) !== 'ok') return false;
  c.cash -= TOOL[tool].cost;
  c.tools.push(tool);
  return true;
}

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export function gradeFor(pct: number): Grade {
  return pct >= 0.06 ? 'A+' : pct >= GOAL ? 'A' : pct >= 0.01 ? 'B' : pct >= 0 ? 'C' : pct >= -0.03 ? 'D' : 'F';
}

export interface DayResult {
  equity: number;
  trades: readonly Trade[];
  fees: number;
  closes: Partial<Record<StockId, number>>;
  halts: number;
  locked: boolean;
}

export interface DaySummary {
  day: number;
  start: number;
  equity: number;
  pnl: number;
  pct: number;
  grade: Grade;
  trades: number;
  wins: number;
  best: Trade | null;
  worst: Trade | null;
  fees: number;
  locked: boolean;
  goal: boolean;
  rankBefore: string;
  rankAfter: string;
  /** The account went under and a fresh one started. */
  blown: boolean;
  streak: number;
}

/** Book the day: account, records, history, the next day. */
export function finishDay(c: Career, r: DayResult): DaySummary {
  const start = c.cash;
  const pnl = r.equity - start;
  const pct = start > 0 ? pnl / start : 0;
  const wins = r.trades.filter((t) => t.pnl > 0).length;
  const sorted = [...r.trades].sort((a, b) => b.pnl - a.pnl);
  const rankBefore = rankFor(start).name;
  const st = c.stats;
  st.days++;
  st.trades += r.trades.length;
  st.wins += wins;
  st.fees += r.fees;
  st.halts += r.halts;
  st.bestDay = Math.max(st.bestDay, pnl);
  st.worstDay = Math.min(st.worstDay, pnl);
  if (sorted.length) {
    st.bestTrade = Math.max(st.bestTrade, sorted[0].pnl);
    st.worstTrade = Math.min(st.worstTrade, sorted[sorted.length - 1].pnl);
  }
  const goal = pct >= GOAL;
  if (goal) st.goals++;
  if (pnl > 0) {
    st.green++;
    c.streak++;
  } else c.streak = 0;
  st.bestStreak = Math.max(st.bestStreak, c.streak);
  st.peak = Math.max(st.peak, r.equity);
  c.history.push({ day: c.day, pnl, pct, trades: r.trades.length, wins });
  if (c.history.length > HISTORY) c.history.splice(0, c.history.length - HISTORY);
  c.closes = { ...c.closes, ...r.closes };
  c.cash = Math.max(0, r.equity);
  const day = c.day;
  c.day++;
  c.live = null;
  const blown = c.cash < BLOWN_BELOW;
  if (blown) {
    st.blown++;
    c.cash = START_CASH;
    c.streak = 0;
  }
  return {
    day,
    start,
    equity: r.equity,
    pnl,
    pct,
    grade: gradeFor(pct),
    trades: r.trades.length,
    wins,
    best: sorted[0] ?? null,
    worst: sorted.length ? sorted[sorted.length - 1] : null,
    fees: r.fees,
    locked: r.locked,
    goal,
    rankBefore,
    rankAfter: rankFor(c.cash).name,
    blown,
    streak: c.streak,
  };
}

/**
 * Coming back to a session that was left running: the desk closed out at
 * the last checkpoint. Returns that day's summary, or null if there wasn't one.
 */
export function settleLeftDay(c: Career): DaySummary | null {
  if (!c.live) return null;
  const equity = c.live.equity;
  return finishDay(c, { equity, trades: [], fees: 0, closes: {}, halts: 0, locked: false });
}
