// What carries over between runs: crumbs, the Pantry, which muffins you've
// unlocked, your records and settings. Runs themselves aren't saved; if the
// game closes mid-run, the crumbs you'd collected are banked next time.
import {
  ENEMIES,
  GAME_SPEEDS,
  MUFFIN_BY_ID,
  MUFFINS,
  PANTRY,
  PANTRY_BY_ID,
  WEAPONS,
  type EnemyId,
  type GameSpeed,
  type MuffinId,
  type PantryId,
  type WeaponId,
} from './defs';
import type { RunSummary } from './run';

export interface Best {
  seconds: number;
  level: number;
  kills: number;
  won: boolean;
}

export interface MetaState {
  version: 1;
  crumbs: number;
  /** Crumbs from a run that got cut off; banked on the next start. */
  unbanked: number;
  pantry: Record<PantryId, number>;
  muffins: MuffinId[];
  muffin: MuffinId;
  runs: number;
  wins: number;
  kills: number;
  best: Partial<Record<MuffinId, Best>>;
  /** Weapons you've evolved at least once, and pests you've met. */
  evolved: WeaponId[];
  met: EnemyId[];
  sound: boolean;
  /** Automation settings, for when the Pantry has them. */
  autoPick: boolean;
  autoHop: boolean;
  /** How fast the night plays. */
  speed: GameSpeed;
  updatedAt: number;
}

export function newMeta(now: number): MetaState {
  return {
    version: 1,
    crumbs: 0,
    unbanked: 0,
    pantry: Object.fromEntries(PANTRY.map((p) => [p.id, 0])) as Record<PantryId, number>,
    muffins: ['blueberry'],
    muffin: 'blueberry',
    runs: 0,
    wins: 0,
    kills: 0,
    best: {},
    evolved: [],
    met: [],
    sound: true,
    autoPick: true,
    autoHop: true,
    speed: 'fast',
    updatedAt: now,
  };
}

export const serialize = (m: MetaState): string => JSON.stringify(m);

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/** Reads a save, or null if it isn't one. Anything unknown or out of range is dropped. */
export function deserialize(raw: string): MetaState | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || d.version !== 1) return null;
  const m = newMeta(num(d.updatedAt, Date.now()));
  m.crumbs = Math.floor(num(d.crumbs));
  m.unbanked = Math.floor(num(d.unbanked));
  const pantry = (d.pantry ?? {}) as Record<string, unknown>;
  for (const p of PANTRY) m.pantry[p.id] = Math.min(p.prices.length, Math.floor(num(pantry[p.id])));
  const muffins = Array.isArray(d.muffins) ? d.muffins.filter((x): x is MuffinId => typeof x === 'string' && x in MUFFIN_BY_ID) : [];
  m.muffins = [...new Set<MuffinId>(['blueberry', ...muffins])];
  m.muffin = typeof d.muffin === 'string' && m.muffins.includes(d.muffin as MuffinId) ? (d.muffin as MuffinId) : 'blueberry';
  m.runs = Math.floor(num(d.runs));
  m.wins = Math.floor(num(d.wins));
  m.kills = Math.floor(num(d.kills));
  const best = (d.best ?? {}) as Record<string, Record<string, unknown>>;
  for (const mu of MUFFINS) {
    const b = best[mu.id];
    if (b && typeof b === 'object') m.best[mu.id] = { seconds: num(b.seconds), level: Math.floor(num(b.level, 1)), kills: Math.floor(num(b.kills)), won: b.won === true };
  }
  const weapons = new Set<string>(WEAPONS.map((w) => w.id));
  const enemies = new Set<string>(ENEMIES.map((e) => e.id));
  m.evolved = Array.isArray(d.evolved) ? [...new Set(d.evolved.filter((x): x is WeaponId => typeof x === 'string' && weapons.has(x)))] : [];
  m.met = Array.isArray(d.met) ? [...new Set(d.met.filter((x): x is EnemyId => typeof x === 'string' && enemies.has(x)))] : [];
  m.sound = d.sound !== false;
  m.autoPick = d.autoPick !== false;
  m.autoHop = d.autoHop !== false;
  m.speed = typeof d.speed === 'string' && d.speed in GAME_SPEEDS ? (d.speed as GameSpeed) : 'fast';
  return m;
}

/** Bank a cut-off run's crumbs. Returns how many. */
export function bankUnbanked(m: MetaState): number {
  const n = m.unbanked;
  m.crumbs += n;
  m.unbanked = 0;
  return n;
}

// ---------------------------------------------------------------------------
// The Pantry and muffins

/** The next level's price, or null when it's maxed. */
export function pantryCost(m: MetaState, id: PantryId): number | null {
  return PANTRY_BY_ID[id].prices[m.pantry[id]] ?? null;
}

export function buyPantry(m: MetaState, id: PantryId): boolean {
  const cost = pantryCost(m, id);
  if (cost === null || m.crumbs < cost) return false;
  m.crumbs -= cost;
  m.pantry[id] += 1;
  return true;
}

/** Can you unlock this muffin right now? */
export function canUnlock(m: MetaState, id: MuffinId): boolean {
  const price = MUFFIN_BY_ID[id].price;
  if (m.muffins.includes(id)) return false;
  return price === 'win' ? m.wins > 0 : m.crumbs >= price;
}

export function unlock(m: MetaState, id: MuffinId): boolean {
  if (!canUnlock(m, id)) return false;
  const price = MUFFIN_BY_ID[id].price;
  if (typeof price === 'number') m.crumbs -= price;
  m.muffins.push(id);
  return true;
}

/** Is the Recipe Book bought and switched on? */
export const autoPicking = (m: MetaState): boolean => m.pantry.autopick > 0 && m.autoPick;

export function pick(m: MetaState, id: MuffinId): boolean {
  if (!m.muffins.includes(id)) return false;
  m.muffin = id;
  return true;
}

// ---------------------------------------------------------------------------
// After a run

export interface Banked {
  crumbs: number;
  newBest: boolean;
  /** Muffins this run made unlockable for free (Double Chocolate, on a first win). */
  unlocked: MuffinId[];
}

export function bankRun(m: MetaState, r: RunSummary, met: EnemyId[], evolved: WeaponId[]): Banked {
  m.crumbs += r.crumbs;
  m.unbanked = 0;
  m.runs += 1;
  m.kills += r.kills;
  const firstWin = r.won && m.wins === 0;
  if (r.won) m.wins += 1;
  const old = m.best[r.muffin];
  const better = !old || (r.won && !old.won) || r.seconds > old.seconds;
  if (better) m.best[r.muffin] = { seconds: r.seconds, level: r.level, kills: r.kills, won: r.won || (old?.won ?? false) };
  m.met = [...new Set([...m.met, ...met])];
  m.evolved = [...new Set([...m.evolved, ...evolved])];
  const unlocked: MuffinId[] = [];
  if (firstWin) {
    for (const mu of MUFFINS) {
      if (mu.price === 'win' && !m.muffins.includes(mu.id)) {
        m.muffins.push(mu.id);
        unlocked.push(mu.id);
      }
    }
  }
  return { crumbs: r.crumbs, newBest: better, unlocked };
}
