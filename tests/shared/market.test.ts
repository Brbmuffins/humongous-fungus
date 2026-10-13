import { describe, expect, it } from 'vitest';
import {
  MARKET_HISTORY,
  MARKET_TICK_MS,
  buyGood,
  deserializeMarket,
  holdingChange,
  maxBuy,
  newMarket,
  saleValue,
  sellGood,
  stepMarket,
  type MarketGoodDef,
} from '@shared/market';

const T0 = 1_700_000_000_000;
const hours = (h: number) => h * 3_600_000;
const moods = { calm: 2, rising: 2, falling: 2, boom: 1, crash: 1, wild: 1 };
const GOODS: MarketGoodDef[] = [
  { id: 'fruit', mean: 10, vol: 0.012, revert: 0.012, rotPerHour: 0.4, cap: 100, moodLength: 1, moods },
  { id: 'jam', mean: 60, vol: 0.004, revert: 0.004, rotPerHour: 0, cap: 50, moodLength: 2, moods },
];
const SPREAD = 0.03;

describe('prices', () => {
  it('open with a full chart', () => {
    const m = newMarket(GOODS, T0, 3);
    for (const g of GOODS) expect(m.goods[g.id].history).toHaveLength(MARKET_HISTORY);
  });
  it('change once per tick', () => {
    const m = newMarket(GOODS, T0, 3);
    const before = m.goods.fruit.price;
    expect(stepMarket(m, GOODS, T0 + MARKET_TICK_MS - 1).ticks).toBe(0);
    expect(stepMarket(m, GOODS, T0 + MARKET_TICK_MS).ticks).toBe(1);
    expect(m.goods.fruit.price).not.toBe(before);
  });
  it('stay within bounds over a long run', () => {
    const m = newMarket(GOODS, T0, 11);
    stepMarket(m, GOODS, T0 + hours(48));
    for (const g of GOODS) {
      for (const p of m.goods[g.id].history) {
        expect(p).toBeGreaterThanOrEqual(g.mean * 0.2 - 1e-9);
        expect(p).toBeLessThanOrEqual(g.mean * 5 + 1e-9);
      }
    }
  });
  it('are the same whether time passes in one jump or many steps', () => {
    const a = newMarket(GOODS, T0, 5);
    const b = newMarket(GOODS, T0, 5);
    stepMarket(a, GOODS, T0 + hours(2));
    for (let t = T0; t <= T0 + hours(2); t += 7_919) stepMarket(b, GOODS, t);
    stepMarket(b, GOODS, T0 + hours(2));
    expect(b).toEqual(a);
  });
  it('report mood changes with the time they happened', () => {
    const m = newMarket(GOODS, T0, 8);
    const seen: number[] = [];
    stepMarket(m, GOODS, T0 + hours(1), { onMood: (_id, _mood, at) => seen.push(at) });
    expect(seen.length).toBeGreaterThan(0);
    for (const at of seen) {
      expect(at).toBeGreaterThan(T0);
      expect(at).toBeLessThanOrEqual(T0 + hours(1));
    }
  });
});

describe('trading', () => {
  it('buys within budget and storage', () => {
    const m = newMarket(GOODS, T0, 1);
    const price = m.goods.jam.price;
    expect(maxBuy(m, 'jam', 50, price * 3.5)).toBe(3);
    expect(maxBuy(m, 'jam', 50, 1e12)).toBe(50);
    expect(maxBuy(m, 'jam', 50, 1e12, 10)).toBe(50);
  });
  it('round trips lose only the market cut', () => {
    const m = newMarket(GOODS, T0, 1);
    const spent = buyGood(m, 'jam', 10, 50, 1e9);
    const { value, profit } = sellGood(m, 'jam', 10, SPREAD);
    expect(value).toBeCloseTo(spent * (1 - SPREAD));
    expect(profit).toBeCloseTo(-spent * SPREAD);
    expect(m.goods.jam.held).toBe(0);
  });
  it('profits from price moves, not from the scale growing', () => {
    const m = newMarket(GOODS, T0, 1);
    const spent = buyGood(m, 'jam', 10, 50, 1e9, 50);
    m.goods.jam.price *= 1.5;
    expect(saleValue(m, 'jam', 10, SPREAD)).toBeCloseTo(spent * 1.5 * (1 - SPREAD));
    expect(holdingChange(m, 'jam', SPREAD)).toBeCloseTo(1.5 * (1 - SPREAD) - 1);
  });
  it('sells part of a holding at the average cost', () => {
    const m = newMarket(GOODS, T0, 1);
    const spent = buyGood(m, 'jam', 20, 50, 1e9);
    const { profit } = sellGood(m, 'jam', 5, SPREAD);
    expect(m.goods.jam.held).toBe(15);
    expect(m.goods.jam.paid).toBeCloseTo(spent * 0.75);
    expect(profit).toBeCloseTo(-spent * 0.25 * SPREAD);
  });
});

describe('rot', () => {
  it('rots held stock and pays salvage', () => {
    const m = newMarket(GOODS, T0, 2);
    buyGood(m, 'fruit', 100, 100, 1e9);
    const r = stepMarket(m, GOODS, T0 + hours(1), { salvage: 0.25 });
    expect(m.goods.fruit.held).toBeCloseTo(60, 0);
    expect(r.rotted.fruit).toBeCloseTo(100 - m.goods.fruit.held);
    expect(r.salvage).toBeGreaterThan(0);
  });
  it('rots slower with a lower multiplier', () => {
    const a = newMarket(GOODS, T0, 2);
    const b = newMarket(GOODS, T0, 2);
    buyGood(a, 'fruit', 100, 100, 1e9);
    buyGood(b, 'fruit', 100, 100, 1e9);
    stepMarket(a, GOODS, T0 + hours(1));
    stepMarket(b, GOODS, T0 + hours(1), { rotMult: 0.5 });
    expect(b.goods.fruit.held).toBeGreaterThan(a.goods.fruit.held);
  });
  it('goods without rot keep forever', () => {
    const m = newMarket(GOODS, T0, 2);
    buyGood(m, 'jam', 10, 50, 1e9);
    stepMarket(m, GOODS, T0 + hours(24));
    expect(m.goods.jam.held).toBe(10);
  });
});

describe('saves', () => {
  it('repair damage and add goods that are new since the save', () => {
    const m = deserializeMarket({ goods: { fruit: { price: -1, held: 5, history: ['x'] } } }, GOODS, T0, 1);
    expect(m.goods.fruit.price).toBeGreaterThan(0);
    expect(m.goods.fruit.held).toBe(5);
    expect(m.goods.fruit.history.length).toBeGreaterThan(0);
    expect(m.goods.jam.history).toHaveLength(MARKET_HISTORY);
  });
});
