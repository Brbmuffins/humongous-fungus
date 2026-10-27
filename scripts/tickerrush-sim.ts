// Ticker Rush balance check: bots trade many days, each from a fresh $10,000
// account, and we report how each style does per day. Random trading should
// lose (spread and fees), riding trends and news should win, and the paid
// tools should each be worth something.
//   npx tsx scripts/tickerrush-sim.ts [days]
import { STEP, STOCKS, type StockId } from '../games/tickerrush/src/defs';
import { Desk } from '../games/tickerrush/src/desk';
import { Market, type DayEvent } from '../games/tickerrush/src/market';
import { mulberry32 } from '../shared/rng';

type Bot = (m: Market, d: Desk, ev: DayEvent[], ctx: Ctx) => void;
interface Ctx {
  r: () => number;
  /** When each position should be closed (market minute). */
  exitAt: Map<StockId, number>;
}

const days = Number(process.argv[2] ?? 60);

const bots: Record<string, { bot: Bot; lead?: number; brackets?: boolean }> = {
  idle: { bot: () => {} },
  random: {
    bot: (m, d, _ev, ctx) => {
      if (ctx.r() > 0.01) return;
      const tk = m.tickers[Math.floor(ctx.r() * m.tickers.length)];
      if (d.positions.has(tk.def.id)) d.close(m, tk.def.id, 'manual');
      else d.order(m, tk.def.id, ctx.r() < 0.5 ? 1 : -1, 0.25);
    },
  },
  trend: {
    bot: (m, d, ev) => {
      if (!ev.some((e) => e.kind === 'candle')) return;
      for (const tk of m.tickers) {
        const cs = tk.candles;
        if (cs.length < 4) continue;
        const [a, b, c] = cs.slice(-4, -1);
        const vw = m.vwap(tk);
        const p = d.positions.get(tk.def.id);
        const up = c.c > vw && c.c > b.c && b.c > a.c;
        const down = c.c < vw && c.c < b.c && b.c < a.c;
        if (p && ((p.qty > 0 && c.c < vw) || (p.qty < 0 && c.c > vw))) d.close(m, tk.def.id, 'manual');
        else if (!p && up) d.order(m, tk.def.id, 1, 0.2);
        else if (!p && down) d.order(m, tk.def.id, -1, 0.2);
      }
    },
  },
  news: {
    bot: (m, d, ev, ctx) => {
      for (const e of ev) {
        if (e.kind !== 'news' || !e.news.id) continue;
        const id = e.news.id;
        if (d.positions.has(id)) d.close(m, id, 'manual');
        if (e.news.kind === 'gap') continue;
        d.order(m, id, e.news.sign, 0.3);
        ctx.exitAt.set(id, m.t + 6);
      }
      for (const [id, at] of ctx.exitAt) if (m.t >= at && d.positions.has(id)) d.close(m, id, 'manual');
    },
  },
  whale: {
    bot: (m, d, _ev, ctx) => {
      for (const tk of m.tickers) {
        const last = tk.tape[tk.tape.length - 1];
        const id = tk.def.id;
        const p = d.positions.get(id);
        if (last && last.whale && last.t === m.t && !p) {
          d.order(m, id, last.side, 0.2);
          ctx.exitAt.set(id, m.t + 18);
        }
        if (p && m.t >= (ctx.exitAt.get(id) ?? 0)) d.close(m, id, 'manual');
      }
    },
  },
};
/** A person reading the headline: in `lag` market minutes after it hits, out after `hold`. */
const reader = (lag: number, hold: number): Bot => {
  const seen = new Map<number, { id: StockId; sign: 1 | -1; at: number }>();
  return (m, d, ev, ctx) => {
    for (const e of ev) if (e.kind === 'news' && e.news.id && e.news.kind !== 'gap') seen.set(e.news.n, { id: e.news.id, sign: e.news.sign, at: m.t + lag });
    for (const [n, s] of seen) {
      if (m.t < s.at) continue;
      seen.delete(n);
      const p = d.positions.get(s.id);
      if (p && Math.sign(p.qty) !== s.sign) d.close(m, s.id, 'manual');
      if (!d.positions.has(s.id)) d.order(m, s.id, s.sign, 0.3);
      ctx.exitAt.set(s.id, m.t + hold);
    }
    for (const [id, at] of ctx.exitAt) if (m.t >= at && d.positions.has(id)) d.close(m, id, 'manual');
  };
};
bots['reader 1s'] = { bot: reader(2.2, 10) };
bots['reader 2s'] = { bot: reader(4.3, 10) };
bots['reader+squawk'] = { bot: reader(2.2, 11), lead: 1 };
bots.momentum = {
  bot: (m, d, ev, ctx) => {
    if (!ev.some((e) => e.kind === 'candle')) return;
    for (const tk of m.tickers) {
      const cs = tk.candles;
      if (cs.length < 3) continue;
      const c = cs[cs.length - 2];
      const id = tk.def.id;
      const body = Math.log(c.c / c.o) / (tk.sigma * Math.sqrt(5));
      const vw = m.vwap(tk);
      const p = d.positions.get(id);
      if (p && m.t >= (ctx.exitAt.get(id) ?? 0)) d.close(m, id, 'manual');
      if (d.positions.has(id)) continue;
      if (body > 1.2 && c.c > vw) d.order(m, id, 1, 0.2);
      else if (body < -1.2 && c.c < vw) d.order(m, id, -1, 0.2);
      else continue;
      ctx.exitAt.set(id, m.t + 15);
    }
  },
};
bots['news+squawk'] = { bot: bots.news.bot, lead: 1 };
bots['trend+brackets'] = { bot: bots.trend.bot, brackets: true };

const ids = STOCKS.map((s) => s.id);
console.log(`${days} days per bot, each from $10,000, 2× margin\n`);
console.log('bot               avg/day   median   green   worst    best   trades/day  halts/day');
for (const [name, { bot, lead = 0, brackets }] of Object.entries(bots)) {
  const pcts: number[] = [];
  let trades = 0;
  let halts = 0;
  for (let day = 1; day <= days; day++) {
    const r = mulberry32(day * 7919);
    const pick = [...ids].sort(() => r() - 0.5).slice(0, 5);
    const m = new Market({ seed: 1234, day, ids: pick, closes: {}, lead });
    const d = new Desk(10_000, { leverage: 2, feeMult: 1, brackets: brackets ? { stop: 0.02, target: 0.04 } : null });
    const ctx: Ctx = { r, exitAt: new Map() };
    while (!m.done) {
      const ev = m.step();
      halts += ev.filter((e) => e.kind === 'halt').length;
      d.check(m);
      if (!m.done) bot(m, d, ev, ctx);
    }
    d.check(m);
    trades += d.trades.length;
    pcts.push(d.dayPnl(m) / 10_000);
  }
  pcts.sort((a, b) => a - b);
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`.padStart(8);
  console.log(
    `${name.padEnd(16)} ${pct(avg)} ${pct(pcts[Math.floor(pcts.length / 2)])} ${String(Math.round((pcts.filter((x) => x > 0).length / pcts.length) * 100)).padStart(6)}% ${pct(pcts[0])} ${pct(pcts[pcts.length - 1])} ${(trades / days).toFixed(1).padStart(10)} ${(halts / days).toFixed(2).padStart(10)}`,
  );
}
console.log(`\n(${Math.round(390 / STEP)} steps a day)`);
