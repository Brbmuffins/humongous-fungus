import { describe, expect, it } from 'vitest';
import { GOODS, GOOD_BY_ID, MARKET_HISTORY, MARKET_SPREAD, MARKET_TICK_MS, ROT_SALVAGE } from '../src/game/defs';
import { sealJar, step, tradeBuy, tradeSell } from '../src/game/economy';
import {
  buyGood,
  deserializeMarket,
  holdingChange,
  maxBuy,
  newMarket,
  saleValue,
  sellGood,
  stepMarket,
} from '../src/game/market';
import { deserialize, newGame, serialize } from '../src/game/state';

const T0 = 1_700_000_000_000;
const hours = (h: number) => h * 3_600_000;

describe('prices', () => {
  it('open with a full chart', () => {
    const m = newMarket(T0, 3);
    for (const g of GOODS) expect(m.goods[g.id].history).toHaveLength(MARKET_HISTORY);
  });
  it('change once per tick', () => {
    const m = newMarket(T0, 3);
    const before = m.goods.apples.price;
    expect(stepMarket(m, T0 + MARKET_TICK_MS - 1).ticks).toBe(0);
    expect(stepMarket(m, T0 + MARKET_TICK_MS).ticks).toBe(1);
    expect(m.goods.apples.price).not.toBe(before);
  });
  it('stay within bounds over a long run', () => {
    const m = newMarket(T0, 11);
    stepMarket(m, T0 + hours(48));
    for (const g of GOODS) {
      for (const p of m.goods[g.id].history) {
        expect(p).toBeGreaterThanOrEqual(g.mean * 0.2 - 1e-9);
        expect(p).toBeLessThanOrEqual(g.mean * 5 + 1e-9);
      }
    }
  });
  it('are the same whether time passes in one jump or many steps', () => {
    const a = newMarket(T0, 5);
    const b = newMarket(T0, 5);
    stepMarket(a, T0 + hours(2));
    for (let t = T0; t <= T0 + hours(2); t += 7_919) stepMarket(b, t);
    stepMarket(b, T0 + hours(2));
    expect(b).toEqual(a);
  });
  it('do not reroll when a save is reloaded', () => {
    const s = newGame(T0, 9);
    const copy = deserialize(serialize(s))!;
    stepMarket(s.market, T0 + 60_000);
    stepMarket(copy.market, T0 + 60_000);
    expect(copy.market.goods.morels.price).toBe(s.market.goods.morels.price);
  });
});

describe('trading', () => {
  it('buys within budget and storage', () => {
    const m = newMarket(T0, 1);
    const price = m.goods.truffles.price;
    expect(maxBuy(m, 'truffles', 10, price * 10 * 3.5)).toBe(3);
    expect(maxBuy(m, 'truffles', 10, 1e12)).toBe(GOOD_BY_ID.truffles.cap);
  });
  it('round trips lose only the market cut', () => {
    const m = newMarket(T0, 1);
    const spent = buyGood(m, 'honey', 10, 50, 1e9);
    const { value, profit } = sellGood(m, 'honey', 10);
    expect(value).toBeCloseTo(spent * (1 - MARKET_SPREAD));
    expect(profit).toBeCloseTo(-spent * MARKET_SPREAD);
    expect(m.goods.honey.held).toBe(0);
  });
  it('profits from price moves, not from production growing', () => {
    const m = newMarket(T0, 1);
    const spent = buyGood(m, 'honey', 10, 50, 1e9); // bought at 50 nutrients per point
    m.goods.honey.price *= 1.5;
    expect(saleValue(m, 'honey', 10)).toBeCloseTo(spent * 1.5 * (1 - MARKET_SPREAD));
    expect(holdingChange(m, 'honey')).toBeCloseTo(1.5 * (1 - MARKET_SPREAD) - 1);
  });
  it('sells part of a holding at the average cost', () => {
    const m = newMarket(T0, 1);
    const spent = buyGood(m, 'morels', 20, 10, 1e9);
    const { profit } = sellGood(m, 'morels', 5);
    expect(m.goods.morels.held).toBe(15);
    expect(m.goods.morels.paid).toBeCloseTo(spent * 0.75);
    expect(profit).toBeCloseTo(-spent * 0.25 * MARKET_SPREAD);
  });
});

describe('rot', () => {
  it('apples rot over time and are digested for part of their value', () => {
    const m = newMarket(T0, 2);
    buyGood(m, 'apples', 100, 1, 1e9);
    const r = stepMarket(m, T0 + hours(1));
    const held = m.goods.apples.held;
    expect(held).toBeCloseTo(100 * (1 - GOOD_BY_ID.apples.rotPerHour), 0);
    expect(r.rotted.apples).toBeCloseTo(100 - held);
    expect(r.salvage).toBeGreaterThan(0);
    expect(ROT_SALVAGE).toBeLessThan(1);
  });
  it('honey never spoils', () => {
    const m = newMarket(T0, 2);
    buyGood(m, 'honey', 10, 1, 1e9);
    stepMarket(m, T0 + hours(24));
    expect(m.goods.honey.held).toBe(10);
  });
});

describe('in the game', () => {
  it('only profit counts toward spores', () => {
    const s = newGame(T0, 4);
    s.producers.bonnet = 10;
    s.nutrients = 1e6;
    expect(tradeBuy(s, 'honey', 10)).toBe(true);
    tradeSell(s, 'honey', 10);
    expect(s.jarTotal).toBe(0);
    tradeBuy(s, 'honey', 10);
    s.market.goods.honey.price *= 2;
    tradeSell(s, 'honey', 10);
    expect(s.jarTotal).toBeGreaterThan(0);
  });
  it('reports moves on held goods after time away', () => {
    const s = newGame(T0, 4);
    s.nutrients = 1e6;
    tradeBuy(s, 'apples', 50);
    const r = step(s, T0 + hours(3))!;
    expect(r.market.map((x) => x.id)).toEqual(['apples']);
    expect(r.market[0].heldAfter).toBeLessThan(50);
    expect(r.salvage).toBeGreaterThan(0);
  });
  it('sealing the jar empties the cellar but keeps prices', () => {
    const s = newGame(T0, 4);
    s.nutrients = 1e6;
    tradeBuy(s, 'truffles', 2);
    const price = s.market.goods.truffles.price;
    s.jarTotal = 1e10;
    sealJar(s, 1);
    expect(s.market.goods.truffles.held).toBe(0);
    expect(s.market.goods.truffles.price).toBe(price);
  });
  it('repairs a damaged market save', () => {
    const m = deserializeMarket({ goods: { apples: { price: -1, held: 9999, history: ['x'] } } }, T0, 1);
    expect(m.goods.apples.price).toBeGreaterThan(0);
    expect(m.goods.apples.held).toBe(GOOD_BY_ID.apples.cap);
    expect(m.goods.apples.history.length).toBeGreaterThan(0);
    expect(m.goods.honey.history).toHaveLength(MARKET_HISTORY);
  });
});
