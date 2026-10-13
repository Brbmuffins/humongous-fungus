import { deserializeMarket, newMarket, type MarketState } from '@shared/market';
import { GOODS, GOSSIP_KEPT, START_CAPS, UPGRADES, type GoodId, type UpgradeId } from './defs';

export interface Rumor {
  at: number;
  good: GoodId;
  text: string;
  /** What the rumor claims; it may be wrong. */
  claim: 'up' | 'down';
}

export interface SporeState {
  version: 1;
  caps: number;
  market: MarketState;
  upgrades: Record<UpgradeId, number>;
  gossip: Rumor[];
  /** Newest rumor the player has seen in the Gossip tab. */
  gossipSeenAt: number;
  /** Highest net worth reached. Ranks never go back down. */
  bestWorth: number;
  seed: number;
  createdAt: number;
  /** Wall-clock ms the state has been simulated up to. */
  updatedAt: number;
  stats: {
    trades: number;
    profit: number;
    rotted: number;
    forages: number;
  };
}

const noUpgrades = (): Record<UpgradeId, number> =>
  Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<UpgradeId, number>;

export function newGame(now: number, seed = Math.floor(Math.random() * 2 ** 31)): SporeState {
  return {
    version: 1,
    caps: START_CAPS,
    market: newMarket(GOODS, now, seed),
    upgrades: noUpgrades(),
    gossip: [],
    gossipSeenAt: 0,
    bestWorth: START_CAPS,
    seed,
    createdAt: now,
    updatedAt: now,
    stats: { trades: 0, profit: 0, rotted: 0, forages: 0 },
  };
}

export function serialize(s: SporeState): string {
  return JSON.stringify(s);
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const pos = (v: unknown, fallback: number): number => Math.max(0, num(v, fallback));
const GOOD_SET = new Set<string>(GOODS.map((g) => g.id));

/** Parse a save, repairing anything damaged. Null if unusable. */
export function deserialize(raw: string): SporeState | null {
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
  const seed = Math.floor(pos(d.seed, 1));
  const base = newGame(pos(d.createdAt, now), seed);

  const upgrades = noUpgrades();
  const savedUps = (d.upgrades && typeof d.upgrades === 'object' ? d.upgrades : {}) as Record<string, unknown>;
  for (const u of UPGRADES) upgrades[u.id] = Math.min(u.max, Math.floor(pos(savedUps[u.id], 0)));

  const gossip = Array.isArray(d.gossip)
    ? d.gossip
        .filter(
          (r): r is Rumor =>
            !!r &&
            typeof r === 'object' &&
            typeof (r as Rumor).text === 'string' &&
            GOOD_SET.has((r as Rumor).good) &&
            ((r as Rumor).claim === 'up' || (r as Rumor).claim === 'down') &&
            Number.isFinite((r as Rumor).at),
        )
        .slice(0, GOSSIP_KEPT)
    : [];

  const stats = (d.stats && typeof d.stats === 'object' ? d.stats : {}) as Record<string, unknown>;
  return {
    ...base,
    caps: pos(d.caps, START_CAPS),
    market: deserializeMarket(d.market, GOODS, now, seed),
    upgrades,
    gossip,
    gossipSeenAt: pos(d.gossipSeenAt, 0),
    bestWorth: pos(d.bestWorth, START_CAPS),
    updatedAt: Math.min(now, pos(d.updatedAt, now)),
    stats: {
      trades: Math.floor(pos(stats.trades, 0)),
      profit: num(stats.profit, 0),
      rotted: pos(stats.rotted, 0),
      forages: Math.floor(pos(stats.forages, 0)),
    },
  };
}
