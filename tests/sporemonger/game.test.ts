import { describe, expect, it } from 'vitest';
import { GOOD_BY_ID, RANKS, START_CAPS, UPGRADE_BY_ID } from '../../games/sporemonger/src/defs';
import {
  buy,
  buyUpgrade,
  capFor,
  forage,
  isUnlocked,
  mostYouCanBuy,
  netWorth,
  rankIndex,
  sell,
  spread,
  step,
} from '../../games/sporemonger/src/game';
import { deserialize, newGame, serialize } from '../../games/sporemonger/src/state';

const T0 = 1_700_000_000_000;
const hours = (h: number) => h * 3_600_000;

describe('starting out', () => {
  it('opens with caps, apples and honey', () => {
    const s = newGame(T0, 1);
    expect(s.caps).toBe(START_CAPS);
    expect(netWorth(s)).toBe(START_CAPS);
    expect(isUnlocked(s, 'apples')).toBe(true);
    expect(isUnlocked(s, 'honey')).toBe(true);
    expect(isUnlocked(s, 'morels')).toBe(false);
    expect(buy(s, 'morels', 1)).toBe(false);
  });
  it('foraging always finds a few caps', () => {
    const s = newGame(T0, 1);
    expect(forage(s)).toBe(1);
    expect(s.caps).toBe(START_CAPS + 1);
  });
});

describe('trading', () => {
  it('buying moves caps into stock at the market price', () => {
    const s = newGame(T0, 1);
    const price = s.market.goods.apples.price;
    expect(buy(s, 'apples', 5)).toBe(true);
    expect(s.caps).toBeCloseTo(START_CAPS - 5 * price);
    expect(netWorth(s)).toBeCloseTo(START_CAPS - 5 * price * spread(s));
  });
  it('respects the cellar, and a bigger cellar doubles it', () => {
    const s = newGame(T0, 1);
    s.caps = 1e9;
    expect(mostYouCanBuy(s, 'apples')).toBe(GOOD_BY_ID.apples.cap);
    s.upgrades.cellar = 2;
    expect(capFor(s, 'apples')).toBe(GOOD_BY_ID.apples.cap * 4);
  });
  it('selling records profit and loss', () => {
    const s = newGame(T0, 1);
    buy(s, 'honey', 2);
    s.market.goods.honey.price *= 2;
    const got = sell(s, 'honey', 2);
    expect(got).toBeGreaterThan(0);
    expect(s.stats.profit).toBeGreaterThan(0);
    expect(s.market.goods.honey.held).toBe(0);
  });
  it('haggling lowers the market cut', () => {
    const s = newGame(T0, 1);
    s.caps = 1e9;
    expect(spread(s)).toBe(0.03);
    expect(buyUpgrade(s, 'haggle')).toBe(true);
    expect(spread(s)).toBe(0.02);
  });
});

describe('ranks', () => {
  it('rise with best net worth and never fall back', () => {
    const s = newGame(T0, 1);
    s.caps = RANKS[1].worth;
    step(s, T0 + 1000);
    expect(rankIndex(s)).toBe(1);
    expect(isUnlocked(s, 'morels')).toBe(true);
    s.caps = 10;
    step(s, T0 + 2000);
    expect(rankIndex(s)).toBe(1);
  });
});

describe('time away', () => {
  it('rots stock, pays compost and reports the change', () => {
    const s = newGame(T0, 1);
    buy(s, 'apples', 20);
    const r = step(s, T0 + hours(3), () => 0.5)!;
    expect(r).not.toBeNull();
    expect(r.moves.map((m) => m.id)).toEqual(['apples']);
    expect(r.moves[0].heldAfter).toBeLessThan(20);
    expect(r.compost).toBeGreaterThan(0);
  });
  it('hears gossip about unlocked goods only', () => {
    const s = newGame(T0, 1);
    step(s, T0 + hours(2), () => 0);
    expect(s.gossip.length).toBeGreaterThan(0);
    for (const r of s.gossip) expect(GOOD_BY_ID[r.good].rank).toBe(0);
  });
  it('hears nothing when every roll misses the hearing chance', () => {
    const s = newGame(T0, 1);
    step(s, T0 + hours(2), () => 0.99);
    expect(s.gossip).toHaveLength(0);
  });
  it('a short gap is not an away report', () => {
    const s = newGame(T0, 1);
    expect(step(s, T0 + 30_000)).toBeNull();
  });
});

describe('saves', () => {
  it('round-trip', () => {
    const s = newGame(T0, 3);
    buy(s, 'apples', 3);
    s.upgrades.cellar = 1;
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('clamp bad upgrade levels and drop bad gossip', () => {
    const s = newGame(T0, 3);
    const raw = JSON.parse(serialize(s));
    raw.upgrades.cellar = 999;
    raw.gossip = [{ at: 1, good: 'dragons', text: 'x', claim: 'up' }, { at: 2, good: 'apples', text: 'ok', claim: 'down' }];
    const d = deserialize(JSON.stringify(raw))!;
    expect(d.upgrades.cellar).toBe(UPGRADE_BY_ID.cellar.max);
    expect(d.gossip).toHaveLength(1);
  });
});
