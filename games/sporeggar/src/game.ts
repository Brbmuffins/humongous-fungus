// Sporeggar rules: trading, rot, gossip, ranks and the stall's upgrades.
import {
  buyGood,
  holdingChange,
  maxBuy,
  saleValue,
  sellGood,
  stepMarket,
  type Mood,
} from '@shared/market';
import {
  COMPOST_SHARE,
  COOL_ROT,
  GOODS,
  GOOD_BY_ID,
  GOSSIP_CHANCE,
  GOSSIP_KEPT,
  GOSSIP_TRUTH,
  RANKS,
  SPREADS,
  UPGRADE_BY_ID,
  WELCOME_SECONDS,
  type GoodId,
  type UpgradeId,
} from './defs';
import type { SporeState } from './state';

// ---------------------------------------------------------------------------
// Derived values

export const level = (s: SporeState, id: UpgradeId): number => s.upgrades[id] ?? 0;
export const spread = (s: SporeState): number => SPREADS[level(s, 'haggle')];
export const rotMult = (s: SporeState): number => COOL_ROT ** level(s, 'cool');
export const capFor = (s: SporeState, id: GoodId): number => GOOD_BY_ID[id].cap * 2 ** level(s, 'cellar');

export function rankIndex(s: SporeState): number {
  let r = 0;
  RANKS.forEach((rank, i) => {
    if (s.bestWorth >= rank.worth) r = i;
  });
  return r;
}

export const isUnlocked = (s: SporeState, id: GoodId): boolean => rankIndex(s) >= GOOD_BY_ID[id].rank;

export function stockValue(s: SporeState): number {
  return GOODS.reduce((sum, g) => sum + saleValue(s.market, g.id, s.market.goods[g.id].held, spread(s)), 0);
}

export function netWorth(s: SporeState): number {
  return s.caps + stockValue(s);
}

export function forageValue(s: SporeState): number {
  return (1 + level(s, 'basket')) * (1 + rankIndex(s));
}

export function change(s: SporeState, id: GoodId): number | null {
  return holdingChange(s.market, id, spread(s));
}

// ---------------------------------------------------------------------------
// Time

export interface GoodMove {
  id: GoodId;
  from: number;
  to: number;
  heldBefore: number;
  heldAfter: number;
}

export interface AwayReport {
  elapsed: number;
  worthBefore: number;
  worthAfter: number;
  moves: GoodMove[];
  compost: number;
  rumors: number;
}

function hearRumor(s: SporeState, id: GoodId, mood: Mood, at: number, roll: () => number): boolean {
  const claimTrue = mood === 'rising' || mood === 'boom' ? 'up' : mood === 'falling' || mood === 'crash' ? 'down' : null;
  if (!claimTrue || !isUnlocked(s, id)) return false;
  const g = level(s, 'gossip');
  if (roll() > GOSSIP_CHANCE[g]) return false;
  const claim = roll() < GOSSIP_TRUTH[g] ? claimTrue : claimTrue === 'up' ? 'down' : 'up';
  // Don't repeat the last thing said about this good.
  const last = s.gossip.find((r) => r.good === id)?.text;
  const lines = GOOD_BY_ID[id].gossip[claim].filter((l) => l !== last);
  s.gossip.unshift({ at, good: id, text: lines[Math.floor(roll() * lines.length)], claim });
  if (s.gossip.length > GOSSIP_KEPT) s.gossip.length = GOSSIP_KEPT;
  return true;
}

/**
 * Advance to `now`: prices move, stock rots, rumors spread. Returns a report
 * when the gap was long enough for a welcome-back screen.
 */
export function step(s: SporeState, now: number, roll: () => number = Math.random): AwayReport | null {
  const gap = (now - s.updatedAt) / 1000;
  const away = gap >= WELCOME_SECONDS;
  const worthBefore = away ? netWorth(s) : 0;
  const before = away
    ? GOODS.filter((g) => s.market.goods[g.id].held > 0).map((g) => ({
        id: g.id,
        from: s.market.goods[g.id].price,
        heldBefore: s.market.goods[g.id].held,
      }))
    : [];
  let rumors = 0;
  const summary = stepMarket(s.market, GOODS, now, {
    rotMult: rotMult(s),
    salvage: COMPOST_SHARE,
    onMood: (id, mood, at) => {
      if (hearRumor(s, id as GoodId, mood, at, roll)) rumors += 1;
    },
  });
  s.caps += summary.salvage;
  for (const g of GOODS) {
    const lost = summary.rotted[g.id];
    if (lost) s.stats.rotted += lost;
  }
  s.updatedAt = Math.max(s.updatedAt, now);
  s.bestWorth = Math.max(s.bestWorth, netWorth(s));
  if (!away) return null;
  return {
    elapsed: gap,
    worthBefore,
    worthAfter: netWorth(s),
    moves: before.map((b) => ({ ...b, to: s.market.goods[b.id].price, heldAfter: s.market.goods[b.id].held })),
    compost: summary.salvage,
    rumors,
  };
}

// ---------------------------------------------------------------------------
// Actions

export function mostYouCanBuy(s: SporeState, id: GoodId): number {
  return isUnlocked(s, id) ? maxBuy(s.market, id, capFor(s, id), s.caps) : 0;
}

export function buy(s: SporeState, id: GoodId, amount: number): boolean {
  if (!isUnlocked(s, id)) return false;
  const spent = buyGood(s.market, id, amount, capFor(s, id), s.caps);
  if (spent <= 0) return false;
  s.caps -= spent;
  s.stats.trades += 1;
  return true;
}

/** Sell up to `amount`. Returns caps received. */
export function sell(s: SporeState, id: GoodId, amount: number): number {
  const { value, profit } = sellGood(s.market, id, amount, spread(s));
  if (value <= 0) return 0;
  s.caps += value;
  s.stats.trades += 1;
  s.stats.profit += profit;
  return value;
}

export function forage(s: SporeState): number {
  const v = forageValue(s);
  s.caps += v;
  s.stats.forages += 1;
  s.bestWorth = Math.max(s.bestWorth, netWorth(s));
  return v;
}

export function upgradeCost(s: SporeState, id: UpgradeId): number | null {
  const u = UPGRADE_BY_ID[id];
  const l = level(s, id);
  return l >= u.max ? null : u.cost(l);
}

export function buyUpgrade(s: SporeState, id: UpgradeId): boolean {
  const cost = upgradeCost(s, id);
  if (cost === null || s.caps < cost) return false;
  s.caps -= cost;
  s.upgrades[id] = level(s, id) + 1;
  return true;
}
