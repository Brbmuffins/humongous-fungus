import { describe, expect, it } from 'vitest';
import { DAY_MINUTES, FEE_MIN, LOSS_LIMIT, type StockId } from '../../games/tickerrush/src/defs';
import { Desk, type DeskOptions, type Fill } from '../../games/tickerrush/src/desk';
import { Market } from '../../games/tickerrush/src/market';

const IDS: StockId[] = ['CHIP', 'BORE', 'MOON', 'WOOF', 'FIZZ'];
const closes = { CHIP: 100, BORE: 50, MOON: 30, WOOF: 3, FIZZ: 60 };
const opts = (over: Partial<DeskOptions> = {}): DeskOptions => ({ leverage: 2, feeMult: 1, brackets: null, ...over });

function fresh(over: Partial<DeskOptions> = {}): { m: Market; d: Desk } {
  const m = new Market({ seed: 9, day: 1, ids: IDS, closes, lead: 0 });
  m.step();
  return { m, d: new Desk(10_000, opts(over)) };
}

const filled = (f: Fill | string): Fill => {
  if (typeof f === 'string') throw new Error(`rejected: ${f}`);
  return f;
};

/** Move a stock's price by hand (and reset its halt ring so it doesn't halt). */
function setPrice(m: Market, id: StockId, price: number): void {
  const tk = m.get(id);
  tk.price = price;
  tk.ring = [];
}

describe('the desk', () => {
  it('buys at the ask, charges a fee, and is worth a little less for it', () => {
    const { m, d } = fresh();
    const q = m.quote('BORE');
    const f = filled(d.order(m, 'BORE', 1, 0.25));
    expect(f.qty).toBeGreaterThan(0);
    expect(f.price).toBeGreaterThanOrEqual(q.ask);
    expect(f.fee).toBeGreaterThanOrEqual(FEE_MIN);
    // A quarter of 2× a $10,000 account.
    expect(f.qty * f.price).toBeGreaterThan(4_800);
    expect(f.qty * f.price).toBeLessThanOrEqual(5_000);
    const e = d.equity(m);
    expect(e).toBeLessThan(10_000);
    expect(e).toBeGreaterThan(9_980);
  });

  it('closes the whole position with the other button, and books the trade', () => {
    const { m, d } = fresh();
    const buy = filled(d.order(m, 'CHIP', 1, 0.5));
    setPrice(m, 'CHIP', m.get('CHIP').price * 1.05);
    const sell = filled(d.order(m, 'CHIP', -1, 0.1));
    expect(sell.qty).toBe(-buy.qty);
    expect(d.positions.has('CHIP')).toBe(false);
    expect(sell.closed).not.toBeNull();
    const t = sell.closed!;
    expect(t.side).toBe('long');
    expect(t.qty).toBe(buy.qty);
    expect(t.pnl).toBeCloseTo((sell.price - buy.price) * buy.qty - buy.fee - sell.fee, 6);
    expect(t.pnl).toBeGreaterThan(0);
    expect(d.equity(m)).toBeCloseTo(10_000 + t.pnl, 6);
  });

  it('adds to a position at a blended price', () => {
    const { m, d } = fresh();
    const a = filled(d.order(m, 'FIZZ', 1, 0.1));
    setPrice(m, 'FIZZ', m.get('FIZZ').price * 1.02);
    const b = filled(d.order(m, 'FIZZ', 1, 0.1));
    const p = d.positions.get('FIZZ')!;
    expect(p.qty).toBe(a.qty + b.qty);
    expect(p.avg).toBeCloseTo((a.price * a.qty + b.price * b.qty) / (a.qty + b.qty), 6);
  });

  it('makes money short when the price falls', () => {
    const { m, d } = fresh();
    const short = filled(d.order(m, 'MOON', -1, 0.25));
    expect(short.qty).toBeLessThan(0);
    expect(short.price).toBeLessThanOrEqual(m.quote('MOON').bid + 1e-9);
    setPrice(m, 'MOON', m.get('MOON').price * 0.9);
    expect(d.open(m, 'MOON')).toBeGreaterThan(0);
    const cover = filled(d.close(m, 'MOON', 'manual'));
    expect(cover.closed!.side).toBe('short');
    expect(cover.closed!.pnl).toBeGreaterThan(0);
  });

  it('stops at its buying power', () => {
    const { m, d } = fresh();
    filled(d.order(m, 'CHIP', 1, 1));
    expect(d.buyingPower(m)).toBeLessThan(200);
    // What's left buys a share or two at most.
    const more = d.order(m, 'BORE', 1, 0.25);
    if (typeof more !== 'string') expect(more.qty * more.price).toBeLessThan(200);
    expect(d.exposure(m)).toBeLessThanOrEqual(d.equity(m) * 2);
    while (typeof d.order(m, 'BORE', 1, 1) !== 'string');
    expect(d.order(m, 'BORE', 1, 1)).toBe('no-room');
  });

  it('gives more room with more margin', () => {
    const a = fresh();
    const b = fresh({ leverage: 4 });
    const fa = filled(a.d.order(a.m, 'CHIP', 1, 1));
    const fb = filled(b.d.order(b.m, 'CHIP', 1, 1));
    expect(fb.qty).toBeGreaterThan(fa.qty * 1.9);
  });

  it('halves the fees with Pro pricing', () => {
    const a = fresh();
    const b = fresh({ feeMult: 0.5 });
    const fa = filled(a.d.order(a.m, 'WOOF', 1, 0.5));
    const fb = filled(b.d.order(b.m, 'WOOF', 1, 0.5));
    expect(fb.fee).toBeCloseTo(fa.fee / 2, 6);
  });

  it('sells for you at the stop or the target with Bracket orders', () => {
    const { m, d } = fresh({ brackets: { stop: 0.02, target: 0.04 } });
    filled(d.order(m, 'CHIP', 1, 0.25));
    const p = d.positions.get('CHIP')!;
    expect(p.stop).toBeCloseTo(p.avg * 0.98, 6);
    expect(p.target).toBeCloseTo(p.avg * 1.04, 6);
    setPrice(m, 'CHIP', p.avg * 0.97);
    const fills = d.check(m);
    expect(fills).toHaveLength(1);
    expect(fills[0].why).toBe('stop');
    expect(d.positions.size).toBe(0);

    filled(d.order(m, 'BORE', -1, 0.25));
    const s = d.positions.get('BORE')!;
    expect(s.target).toBeLessThan(s.avg);
    setPrice(m, 'BORE', s.avg * 0.95);
    expect(d.check(m)[0].why).toBe('target');
  });

  it('lets the risk desk take over after a big loss', () => {
    const { m, d } = fresh();
    filled(d.order(m, 'MOON', 1, 1));
    setPrice(m, 'MOON', m.get('MOON').price * (1 - LOSS_LIMIT * 0.8));
    const fills = d.check(m);
    expect(d.locked).toBe(true);
    expect(fills.map((f) => f.why)).toEqual(['risk']);
    expect(d.positions.size).toBe(0);
    expect(d.order(m, 'CHIP', 1, 0.1)).toBe('locked');
  });

  it('will not trade a halted stock', () => {
    const { m, d } = fresh();
    m.get('WOOF').haltUntil = m.t + 5;
    expect(d.order(m, 'WOOF', 1, 0.25)).toBe('halted');
  });

  it('closes everything at the bell', () => {
    const { m, d } = fresh();
    filled(d.order(m, 'CHIP', 1, 0.2));
    filled(d.order(m, 'MOON', -1, 0.2));
    while (!m.done) m.step();
    expect(m.t).toBe(DAY_MINUTES);
    const fills = d.check(m);
    expect(fills.map((f) => f.why).sort()).toEqual(['close', 'close']);
    expect(d.positions.size).toBe(0);
    expect(d.trades).toHaveLength(2);
    expect(d.order(m, 'BORE', 1, 0.1)).toBe('closed');
    expect(d.equity(m)).toBeCloseTo(d.cash, 6);
  });

  it('pays more, and pushes the price, on a thin stock', () => {
    const { m, d } = fresh({ leverage: 6 });
    const before = m.get('WOOF').price;
    const ask = m.quote('WOOF').ask;
    const f = filled(d.order(m, 'WOOF', 1, 1));
    expect(f.price).toBeGreaterThan(ask);
    expect(m.get('WOOF').price).toBeGreaterThan(before);
  });
});
