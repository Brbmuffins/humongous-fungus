import { PRODUCER_IDS, SPECIMEN_BY_ID, UPGRADE_BY_ID, type ProducerId } from './defs';

export interface Cultivation {
  id: string;
  startedAt: number;
  endsAt: number;
}

export interface GameState {
  version: 1;
  nutrients: number;
  /** Nutrients digested in the current jar. Drives spores. */
  jarTotal: number;
  /** Nutrients digested across every jar. */
  lifetime: number;
  producers: Partial<Record<ProducerId, number>>;
  upgrades: string[];
  specimens: string[];
  cultivating: Cultivation | null;
  spores: number;
  /** How many jars have been sealed. 0 for the first jar. */
  jarIndex: number;
  /** Producer and specimen ids ever owned, for the journal. */
  discovered: string[];
  frenzyUntil: number;
  /** Wall-clock ms the state has been simulated up to. */
  updatedAt: number;
  createdAt: number;
  /** Seeds the jar's layout. Changes with each new jar. */
  seed: number;
  stats: {
    taps: number;
    blooms: number;
    playSeconds: number;
    bestRate: number;
  };
}

export function newGame(now: number, seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  return {
    version: 1,
    nutrients: 0,
    jarTotal: 0,
    lifetime: 0,
    producers: {},
    upgrades: [],
    specimens: [],
    cultivating: null,
    spores: 0,
    jarIndex: 0,
    discovered: [],
    frenzyUntil: 0,
    updatedAt: now,
    createdAt: now,
    seed,
    stats: { taps: 0, blooms: 0, playSeconds: 0, bestRate: 0 },
  };
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;

const ids = (v: unknown, known: (id: string) => boolean): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && known(x)))] : [];

const isProducer = (id: string): id is ProducerId => (PRODUCER_IDS as readonly string[]).includes(id);

/** Parse a save, dropping anything unknown or malformed. Null if unusable. */
export function deserialize(raw: string): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1) return null;

  const now = Date.now();
  const base = newGame(num(d.createdAt, now), Math.floor(num(d.seed, 1)));

  const producers: GameState['producers'] = {};
  if (d.producers && typeof d.producers === 'object') {
    for (const [id, count] of Object.entries(d.producers as Record<string, unknown>)) {
      if (isProducer(id)) producers[id] = Math.floor(num(count, 0));
    }
  }

  let cultivating: Cultivation | null = null;
  if (d.cultivating && typeof d.cultivating === 'object') {
    const c = d.cultivating as Record<string, unknown>;
    if (typeof c.id === 'string' && SPECIMEN_BY_ID.has(c.id)) {
      cultivating = { id: c.id, startedAt: num(c.startedAt, now), endsAt: num(c.endsAt, now) };
    }
  }

  const stats = (d.stats && typeof d.stats === 'object' ? d.stats : {}) as Record<string, unknown>;

  return {
    ...base,
    nutrients: num(d.nutrients, 0),
    jarTotal: num(d.jarTotal, 0),
    lifetime: num(d.lifetime, 0),
    producers,
    upgrades: ids(d.upgrades, (id) => UPGRADE_BY_ID.has(id)),
    specimens: ids(d.specimens, (id) => SPECIMEN_BY_ID.has(id)),
    cultivating,
    spores: Math.floor(num(d.spores, 0)),
    jarIndex: Math.floor(num(d.jarIndex, 0)),
    discovered: ids(d.discovered, (id) => isProducer(id) || SPECIMEN_BY_ID.has(id)),
    frenzyUntil: num(d.frenzyUntil, 0),
    updatedAt: num(d.updatedAt, now),
    stats: {
      taps: Math.floor(num(stats.taps, 0)),
      blooms: Math.floor(num(stats.blooms, 0)),
      playSeconds: num(stats.playSeconds, 0),
      bestRate: num(stats.bestRate, 0),
    },
  };
}

/** Of several saves for the same player, the one with the most progress. */
export function pickBest(saves: GameState[]): GameState | null {
  let best: GameState | null = null;
  for (const s of saves) {
    if (!best || s.lifetime > best.lifetime || (s.lifetime === best.lifetime && s.updatedAt > best.updatedAt)) {
      best = s;
    }
  }
  return best;
}
