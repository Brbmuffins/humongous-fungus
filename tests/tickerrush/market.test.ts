import { describe, expect, it } from 'vitest';
import { CANDLE, DAY_MINUTES, HALT_MINUTES, STEP, STOCKS, type StockId } from '../../games/tickerrush/src/defs';
import { candlesFromTicks } from '../../games/tickerrush/src/chart';
import { Market, busyness, spreadOf, type DayEvent, type DaySetup } from '../../games/tickerrush/src/market';

const IDS: StockId[] = ['MUFN', 'SPUD', 'SYRP', 'PIKL', 'DOUGH'];
const setup = (over: Partial<DaySetup> = {}): DaySetup => ({ seed: 42, day: 3, ids: IDS, closes: {}, lead: 0, ...over });

function run(m: Market): DayEvent[] {
  const all: DayEvent[] = [];
  while (!m.done) all.push(...m.step());
  return all;
}

describe('a trading day', () => {
  it('plays the same day from the same seed', () => {
    const a = new Market(setup());
    const b = new Market(setup());
    run(a);
    run(b);
    expect(a.tickers.map((t) => t.price)).toEqual(b.tickers.map((t) => t.price));
    expect(a.news.map((n) => n.text)).toEqual(b.news.map((n) => n.text));
  });

  it('plays a different day on a different day number', () => {
    const a = new Market(setup());
    const b = new Market(setup({ day: 4 }));
    run(a);
    run(b);
    expect(a.tickers[0].price).not.toBe(b.tickers[0].price);
  });

  it('runs 9:30 to 4:00 in 5-minute candles and closes once', () => {
    const m = new Market(setup());
    const events = run(m);
    expect(m.t).toBe(DAY_MINUTES);
    expect(events.filter((e) => e.kind === 'close')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'power')).toHaveLength(1);
    for (const tk of m.tickers) {
      expect(tk.candles).toHaveLength(DAY_MINUTES / CANDLE);
      tk.candles.forEach((c, i) => {
        expect(c.t).toBeCloseTo(i * CANDLE, 6);
        expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c) - 1e-9);
        expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c) + 1e-9);
      });
      expect(tk.price).toBeGreaterThan(0);
    }
    // Nothing moves after the bell.
    expect(m.step()).toEqual([]);
  });

  it('opens near yesterday\'s close, except the gappers', () => {
    const closes = Object.fromEntries(IDS.map((id) => [id, 50])) as Record<StockId, number>;
    const m = new Market(setup({ closes }));
    const gappers = m.tickers.filter((t) => t.gap !== 0);
    expect(gappers.length).toBeGreaterThanOrEqual(1);
    expect(gappers.length).toBeLessThanOrEqual(2);
    for (const tk of m.tickers) {
      expect(tk.prev).toBe(50);
      if (tk.gap !== 0) {
        expect(tk.open).toBeCloseTo(50 * Math.exp(tk.gap), 6);
        expect(m.news.some((n) => n.kind === 'gap' && n.id === tk.def.id)).toBe(true);
      } else expect(Math.abs(Math.log(tk.open / 50))).toBeLessThan(tk.def.vol);
    }
  });

  it('puts real headlines on the wire, about today\'s stocks', () => {
    for (let day = 1; day <= 20; day++) {
      const m = new Market(setup({ day }));
      run(m);
      expect(m.news.length).toBeGreaterThanOrEqual(8);
      for (const n of m.news) {
        expect(n.text).not.toMatch(/[{}]/);
        if (n.id) expect(IDS).toContain(n.id);
        expect(n.t).toBeGreaterThanOrEqual(0);
        expect(n.t).toBeLessThanOrEqual(DAY_MINUTES);
      }
    }
  });

  it('moves prices after news, in the headline\'s direction more often than not', () => {
    let right = 0;
    let total = 0;
    for (let day = 1; day <= 30; day++) {
      const m = new Market(setup({ day }));
      const seen: { id: StockId; sign: number; at: number; price: number }[] = [];
      while (!m.done) {
        for (const e of m.step()) {
          if (e.kind === 'news' && e.news.id && e.news.kind !== 'gap') seen.push({ id: e.news.id, sign: e.news.sign, at: m.t, price: m.get(e.news.id).price });
        }
        for (const s of seen.filter((s) => s.at > 0 && m.t >= s.at + 8)) {
          total++;
          if (Math.sign(m.get(s.id).price - s.price) === s.sign) right++;
          s.at = -1;
        }
      }
    }
    expect(total).toBeGreaterThan(150);
    expect(right / total).toBeGreaterThan(0.6);
    // ...but not every time: some news was priced in, rumors get denied.
    expect(right / total).toBeLessThan(0.95);
  });

  it('gives News squawk the same day, with the headlines earlier', () => {
    const a = new Market(setup({ day: 7 }));
    const b = new Market(setup({ day: 7, lead: 1 }));
    run(a);
    run(b);
    expect(b.tickers.map((t) => t.price)).toEqual(a.tickers.map((t) => t.price));
    const times = (m: Market) => {
      const by = new Map<string, number[]>();
      for (const n of m.news) if (n.kind !== 'gap') by.set(n.text, [...(by.get(n.text) ?? []), n.t]);
      return by;
    };
    const late = times(a);
    const early = times(b);
    expect(early.size).toBeGreaterThan(5);
    for (const [text, ts] of early) {
      const was = late.get(text)!;
      expect(was).toHaveLength(ts.length);
      ts.forEach((t, i) => expect(t).toBeCloseTo(was[i] - 1, 1));
    }
  });

  it('halts a stock that moves too far too fast, then reopens it', () => {
    let checked = 0;
    for (let day = 1; day <= 60 && checked < 3; day++) {
      const m = new Market(setup({ day }));
      while (!m.done) {
        const ev = m.step();
        const h = ev.find((e) => e.kind === 'halt');
        if (!h || h.kind !== 'halt') continue;
        const tk = m.get(h.id);
        const frozen = tk.price;
        const until = tk.haltUntil!;
        expect(until - m.t).toBeLessThanOrEqual(HALT_MINUTES + 1e-9);
        expect(m.quote(h.id).halted).toBe(true);
        let resumed = false;
        while (!m.done && !resumed) {
          const later = m.step();
          resumed = later.some((e) => e.kind === 'resume' && e.id === h.id);
          if (!resumed && !m.done) expect(tk.price).toBe(frozen);
        }
        if (resumed) expect(m.t).toBeGreaterThanOrEqual(until - STEP);
        expect(m.quote(h.id).halted).toBe(false);
        checked++;
        break;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('shows whales on the tape now and then', () => {
    let whales = 0;
    for (let day = 1; day <= 5; day++) {
      const m = new Market(setup({ day }));
      while (!m.done) {
        m.step();
        for (const tk of m.tickers) {
          const p = tk.tape[tk.tape.length - 1];
          if (p?.whale && p.t === m.t) whales++;
        }
      }
    }
    expect(whales).toBeGreaterThan(10);
  });

  it('keeps every tick of the day for the live chart', () => {
    const m = new Market(setup({ day: 5 }));
    const tk = m.tickers[0];
    expect(m.count).toBe(1);
    expect(tk.ticks[0]).toBeCloseTo(tk.open, 3);
    let steps = 0;
    while (!m.done) {
      m.step();
      steps++;
      if (steps % 97 === 0) expect(tk.ticks[m.count - 1]).toBeCloseTo(tk.price, 3);
    }
    expect(m.count).toBe(Math.round(DAY_MINUTES / STEP) + 1);
    expect(tk.ticks[m.count - 1]).toBeCloseTo(tk.price, 3);
    let shares = 0;
    for (let i = 0; i < m.count; i++) shares += tk.vols[i];
    expect(shares / tk.volume).toBeCloseTo(1, 4);
    expect(tk.vws[m.count - 1]).toBeCloseTo(m.vwap(tk), 2);
  });

  it('builds the same candles from ticks as the 5-minute chart', () => {
    const m = new Market(setup({ day: 6 }));
    for (let i = 0; i < 1234; i++) m.step();
    for (const tk of m.tickers) {
      const { candles, first } = candlesFromTicks(tk, m.count, CANDLE, 1000);
      expect(first).toBe(0);
      expect(candles).toHaveLength(tk.candles.length);
      candles.forEach((k, i) => {
        const real = tk.candles[i];
        for (const key of ['o', 'h', 'l', 'c'] as const) expect(k[key] / real[key]).toBeCloseTo(1, 4);
      });
      // And one-minute candles: five for every five-minute one.
      const ones = candlesFromTicks(tk, m.count, 1, 1000).candles;
      expect(ones.length).toBe(Math.ceil((m.count - 2) / 10));
      expect(Math.max(...ones.slice(0, 5).map((k) => k.h)) / tk.candles[0].h).toBeCloseTo(1, 4);
    }
  });

  it('is busy at the open and the close, quiet at lunch', () => {
    expect(busyness(0)).toBeGreaterThan(busyness(180) * 2);
    expect(busyness(389)).toBeGreaterThan(busyness(180) * 1.4);
  });

  it('quotes a bid under the ask, to the cent', () => {
    for (const def of STOCKS) {
      for (const p of [1.234, 12.5, 99.99, 250]) {
        const { bid, ask } = spreadOf(def, p);
        expect(ask).toBeGreaterThan(bid);
        expect(Math.round(bid * 100)).toBeCloseTo(bid * 100, 6);
        expect(Math.round(ask * 100)).toBeCloseTo(ask * 100, 6);
        expect(bid).toBeLessThanOrEqual(p);
        expect(ask).toBeGreaterThanOrEqual(p);
      }
    }
  });
});
