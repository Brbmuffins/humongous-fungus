// Your side of the table: coins, the bet you have riding, settings, stats and
// the rounds you've seen. One JSON save. A bet stays in its round even if you
// leave: come back and it's settled the way the round went (paid if your auto
// cash-out was at or under the crash, lost if not).
import { HISTORY, MAX_BET, MAX_TARGET, MIN_BET, MIN_TARGET, REFILL_COINS, REFILL_SECONDS, START_COINS } from './defs';
import { cents } from './fair';
import { payoutFor, type Bet, type Table } from './game';

export const YOU = 'You';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** The bet and auto cash-out last used, for the next round. */
  bet: number;
  auto: number;
  autoOn: boolean;
}

export interface Stats {
  /** Rounds you had a bet in. */
  rounds: number;
  wins: number;
  wagered: number;
  /** Everything paid back to you. */
  paid: number;
  /** Biggest single profit. */
  biggestWin: number;
  bestCashout: number;
  /** The highest crash you've seen, bet or not. */
  highestCrash: number;
  refills: number;
}

export interface RoundRecord {
  id: number;
  crash: number;
  hash: string;
  seed: string;
}

/** Your bet in a round that hasn't finished. */
export interface Pending {
  round: number;
  crash: number;
  amount: number;
  target: number | null;
}

export interface Save {
  version: 1;
  createdAt: number;
  updatedAt: number;
  coins: number;
  settings: Settings;
  stats: Stats;
  history: RoundRecord[];
  pending: Pending | null;
  /** A bet for the next round, placed while one was flying. */
  queued: { amount: number; target: number | null } | null;
  /** Broke: when Grandma's coins land. */
  refillAt: number | null;
  /** The next round's number. */
  nextRound: number;
}

export const noStats = (): Stats => ({ rounds: 0, wins: 0, wagered: 0, paid: 0, biggestWin: 0, bestCashout: 0, highestCrash: 0, refills: 0 });

export function newSave(now: number): Save {
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    coins: START_COINS,
    settings: { sound: true, haptics: true, bet: 100, auto: 2, autoOn: false },
    stats: noStats(),
    history: [],
    pending: null,
    queued: null,
    refillAt: null,
    nextRound: 1,
  };
}

export const profit = (s: Save): number => s.stats.paid - s.stats.wagered;

/** Clamp a bet to what's allowed and what you have. */
export function clampBet(amount: number, coins: number): number {
  const a = Math.floor(Number.isFinite(amount) ? amount : MIN_BET);
  return Math.max(MIN_BET, Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(coins)), a));
}

export function clampTarget(target: number): number {
  return cents(Math.max(MIN_TARGET, Math.min(MAX_TARGET, Number.isFinite(target) ? target : 2)));
}

export type BetResult = 'ok' | 'phase' | 'funds' | 'already';

/** Bet on the round in its countdown. The coins leave your balance right away. */
export function placeBet(s: Save, table: Table, amount: number, target: number | null): BetResult {
  if (table.phase !== 'betting') return 'phase';
  if (table.yours) return 'already';
  const a = Math.floor(amount);
  if (a < MIN_BET || a > MAX_BET || a > s.coins) return 'funds';
  const t = target === null ? null : clampTarget(target);
  if (!table.join({ who: YOU, you: true, amount: a, target: t })) return 'already';
  s.coins -= a;
  s.stats.rounds += 1;
  s.stats.wagered += a;
  s.pending = { round: table.round.id, crash: table.round.crash, amount: a, target: t };
  s.queued = null;
  return 'ok';
}

/** Changed your mind before launch: the coins come back. */
export function cancelBet(s: Save, table: Table): boolean {
  const b = table.leave(YOU);
  if (!b) return false;
  s.coins += b.amount;
  s.stats.rounds -= 1;
  s.stats.wagered -= b.amount;
  s.pending = null;
  return true;
}

/** While a round flies: bet on the next one instead. */
export function queueBet(s: Save, amount: number, target: number | null): boolean {
  const a = Math.floor(amount);
  if (a < MIN_BET || a > MAX_BET) return false;
  s.queued = { amount: a, target: target === null ? null : clampTarget(target) };
  return true;
}

/** A new round opened: place the queued bet if you can still cover it. */
export function placeQueued(s: Save, table: Table): BetResult | null {
  const q = s.queued;
  if (!q) return null;
  s.queued = null;
  return placeBet(s, table, q.amount, q.target);
}

function won(s: Save, b: Bet): void {
  s.coins += b.payout;
  s.stats.paid += b.payout;
  s.stats.wins += 1;
  s.stats.biggestWin = Math.max(s.stats.biggestWin, b.payout - b.amount);
  s.stats.bestCashout = Math.max(s.stats.bestCashout, b.cashedAt ?? 0);
  s.pending = null;
}

/** Cash out by hand. Returns your bet, paid, or null if you couldn't. */
export function cashOut(s: Save, table: Table): Bet | null {
  const b = table.cashOut(YOU);
  if (b) won(s, b);
  return b;
}

/** The table auto-cashed one of yours. */
export function autoCashed(s: Save, b: Bet): void {
  if (b.you) won(s, b);
}

/** The round crashed: book it. Returns what you lost (0 if you weren't in or got out). */
export function crashed(s: Save, table: Table): number {
  const r = table.round;
  s.history.unshift({ id: r.id, crash: r.crash, hash: r.hash, seed: r.seed });
  if (s.history.length > HISTORY) s.history.length = HISTORY;
  s.stats.highestCrash = Math.max(s.stats.highestCrash, r.crash);
  const b = table.yours;
  s.pending = null;
  return b && b.cashedAt === null ? b.amount : 0;
}

/**
 * Coming back with a bet still riding in a round you left: settle it the way
 * that round went. Returns the payout (0 if it was lost), or null if there
 * was nothing riding.
 */
export function settleLeft(s: Save): number | null {
  const p = s.pending;
  if (!p) return null;
  s.pending = null;
  s.stats.highestCrash = Math.max(s.stats.highestCrash, p.crash);
  if (p.target !== null && p.target <= p.crash) {
    const payout = payoutFor(p.amount, p.target);
    s.coins += payout;
    s.stats.paid += payout;
    s.stats.wins += 1;
    s.stats.biggestWin = Math.max(s.stats.biggestWin, payout - p.amount);
    s.stats.bestCashout = Math.max(s.stats.bestCashout, p.target);
    return payout;
  }
  return 0;
}

/** Too broke to bet, with nothing riding. */
export const broke = (s: Save): boolean => s.coins < MIN_BET && !s.pending && !s.queued;

/**
 * Grandma's coins: once you're broke they're on the way, and land REFILL_SECONDS
 * later. Returns true when it just landed.
 */
export function tickRefill(s: Save, now: number): boolean {
  if (!broke(s)) {
    s.refillAt = null;
    return false;
  }
  if (s.refillAt === null) {
    s.refillAt = now + REFILL_SECONDS * 1000;
    return false;
  }
  if (now < s.refillAt) return false;
  s.coins += REFILL_COINS;
  s.refillAt = null;
  s.stats.refills += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Saves

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const pos = (v: unknown, fallback: number): number => Math.max(0, num(v, fallback));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const hex = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/** Parse a save, repairing anything damaged. Null if unusable. */
export function loadSave(raw: string | null): Save | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const d = obj(data);
  if (d.version !== 1) return null;
  const now = Date.now();
  const base = newSave(pos(d.createdAt, now));
  const set = obj(d.settings);
  const st = obj(d.stats);
  const stat = (k: keyof Stats) => pos(st[k], 0);
  const p = obj(d.pending);
  const q = obj(d.queued);
  const target = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? clampTarget(v) : null);
  return {
    ...base,
    updatedAt: Math.min(now, pos(d.updatedAt, now)),
    coins: Math.floor(pos(d.coins, START_COINS)),
    settings: {
      sound: set.sound !== false,
      haptics: set.haptics !== false,
      bet: clampBet(num(set.bet, base.settings.bet), MAX_BET),
      auto: clampTarget(num(set.auto, base.settings.auto)),
      autoOn: set.autoOn === true,
    },
    stats: {
      rounds: Math.floor(stat('rounds')),
      wins: Math.floor(stat('wins')),
      wagered: stat('wagered'),
      paid: stat('paid'),
      biggestWin: stat('biggestWin'),
      bestCashout: stat('bestCashout'),
      highestCrash: stat('highestCrash'),
      refills: Math.floor(stat('refills')),
    },
    history: (Array.isArray(d.history) ? d.history : [])
      .map(obj)
      .filter((r) => typeof r.crash === 'number' && r.crash >= 1 && hex(r.hash) && hex(r.seed))
      .map((r) => ({ id: Math.floor(pos(r.id, 0)), crash: cents(r.crash as number), hash: r.hash as string, seed: r.seed as string }))
      .slice(0, HISTORY),
    pending:
      typeof p.amount === 'number' && p.amount >= MIN_BET && typeof p.crash === 'number' && p.crash >= 1
        ? { round: Math.floor(pos(p.round, 0)), crash: cents(p.crash), amount: Math.floor(Math.min(MAX_BET, p.amount)), target: target(p.target) }
        : null,
    queued: typeof q.amount === 'number' && q.amount >= MIN_BET ? { amount: Math.floor(Math.min(MAX_BET, q.amount)), target: target(q.target) } : null,
    refillAt: typeof d.refillAt === 'number' && Number.isFinite(d.refillAt) ? d.refillAt : null,
    nextRound: Math.max(1, Math.floor(pos(d.nextRound, 1))),
  };
}
