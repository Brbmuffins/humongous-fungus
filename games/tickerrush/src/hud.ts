// The live trading screen: account bar, watchlist, chart header, the news
// wire and the tape, and the order ticket. Lists refresh a few times a
// second; the account bar and chart every frame.
import { h, setDisabled, setText } from '@shared/dom';
import { CHART_MODES, CandleChart, clockAt, priceText, type ChartMode, type Mark } from './chart';
import { DAY_MINUTES, GOAL, LOSS_LIMIT, SIZES, SIZE_ORDER, type SizeId, type StockId } from './defs';
import type { Desk } from './desk';
import type { Market, News } from './market';

export const money = (n: number, cents = true): string => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${a.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
  return n < 0 ? `-${s}` : s;
};
export const signed = (n: number, cents = true): string => (n >= 0 ? '+' : '−') + money(Math.abs(n), cents);
export const pctText = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(2)}%`;
const tone = (x: number): string => (x > 1e-9 ? 'up' : x < -1e-9 ? 'down' : 'flat');

/** Shares on the bid or ask, in lots of 100: made up, but it changes with every tick like the real thing. */
function depth(count: number, id: StockId, side: number): number {
  let x = (count * 2654435761 + side * 40503 + id.charCodeAt(0) * 97 + id.charCodeAt(1)) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0x5bd1e995) >>> 0;
  return 1 + ((x >>> 8) % 24);
}

export interface HudActions {
  select(id: StockId): void;
  chart(mode: ChartMode): void;
  order(side: 1 | -1): void;
  size(id: SizeId): void;
  flattenAll(): void;
  pause(): void;
}

export interface HudState {
  market: Market;
  /** Null while a demo market runs behind the menus. */
  desk: Desk | null;
  selected: StockId;
  size: SizeId;
  level2: boolean;
  fills: readonly Mark[];
  /** Market minutes per real second, for countdowns. */
  pace: number;
  /** How far the clock is toward the next tick, 0–1. */
  frac: number;
  chart: ChartMode;
}

interface Chip {
  el: HTMLButtonElement;
  px: HTMLElement;
  /** The price it last showed, and when it last flashed. */
  shown: string;
  flashAt: number;
  chg: HTMLElement;
  badge: HTMLElement;
  spark: SVGPolylineElement;
  candles: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  readonly chart: CandleChart;
  private chips = new Map<StockId, Chip>();
  private sizeBtns = new Map<SizeId, HTMLButtonElement>();
  private modeBtns = new Map<ChartMode, HTMLButtonElement>();
  private crawl: { id: StockId | null; px: HTMLElement[]; chg: HTMLElement[]; items: HTMLElement[] }[] = [];
  private lastShown = '';
  private el = {
    pnl: $('pnl'),
    equity: $('equity'),
    bp: $('bp'),
    meter: $('meter'),
    meterFill: $('meter-fill'),
    clock: $('clock'),
    session: $('session'),
    watch: $('watch'),
    sym: $('sym'),
    co: $('co'),
    last: $('last'),
    chg: $('chg'),
    halt: $('halt'),
    haltSub: $('halt-sub'),
    breaking: $<HTMLButtonElement>('breaking'),
    floats: $('floats'),
    banner: $('banner'),
    news: $('news'),
    tapeBox: $('tape-box'),
    tape: $('tape'),
    pos: $('pos'),
    sizes: $('sizes'),
    buy: $<HTMLButtonElement>('buy'),
    buyAct: $('buy-act'),
    buySub: $('buy-sub'),
    sell: $<HTMLButtonElement>('sell'),
    sellAct: $('sell-act'),
    sellSub: $('sell-sub'),
    flatAll: $<HTMLButtonElement>('flat-all'),
    toast: $('toast'),
    crawl: $('crawl'),
    modes: $('modes'),
  };
  private listsAt = 0;
  private chipShown: StockId | null = null;
  private newsShown = -1;
  private tapeShown = '';
  private breakingQueue: News[] = [];
  private breakingUntil = 0;
  private breakingId: StockId | null = null;
  private bannerTimer = 0;
  private toastTimer = 0;

  constructor(private act: HudActions) {
    this.chart = new CandleChart($<HTMLCanvasElement>('chart'));
    for (const id of SIZE_ORDER) {
      const b = h('button', { class: 'size', type: 'button', role: 'radio', 'aria-checked': 'false', onclick: () => act.size(id) }, SIZES[id].name);
      this.sizeBtns.set(id, b);
      this.el.sizes.append(b);
    }
    for (const mode of CHART_MODES) {
      const b = h('button', { class: 'mode', type: 'button', role: 'radio', 'aria-checked': 'false', onclick: () => act.chart(mode) }, mode === 'live' ? 'LIVE' : mode.toUpperCase());
      this.modeBtns.set(mode, b);
      this.el.modes.append(b);
    }
    this.el.buy.addEventListener('click', () => act.order(1));
    this.el.sell.addEventListener('click', () => act.order(-1));
    this.el.flatAll.addEventListener('click', () => act.flattenAll());
    $('pause').addEventListener('click', () => act.pause());
    this.el.breaking.addEventListener('click', () => {
      if (this.breakingId) act.select(this.breakingId);
      this.breakingUntil = 0;
    });
  }

  /** A new day (or demo): build the watchlist. */
  setup(m: Market): void {
    this.el.watch.replaceChildren();
    this.chips.clear();
    this.chipShown = null;
    this.newsShown = -1;
    this.tapeShown = '';
    this.breakingQueue = [];
    this.breakingUntil = 0;
    this.el.breaking.hidden = true;
    this.el.news.replaceChildren();
    for (const tk of m.tickers) {
      const id = tk.def.id;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 60 20');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('spark');
      const spark = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      svg.append(spark);
      const px = h('span', { class: 'chip-px' });
      const chg = h('span', { class: 'chip-chg' });
      const badge = h('span', { class: 'chip-badge' });
      const el = h('button', { class: 'chip', type: 'button', 'data-id': id, onclick: () => this.act.select(id) }, h('span', { class: 'chip-id' }, id), badge, px, chg);
      el.append(svg);
      this.el.watch.append(el);
      this.chips.set(id, { el, px, chg, badge, spark, candles: -1, shown: '', flashAt: 0 });
    }
    // The crawl: every ticker and the index, twice over so it loops without a seam.
    this.crawl = [...m.tickers.map((tk) => tk.def.id), null].map((id) => ({ id, px: [], chg: [], items: [] }));
    const track: HTMLElement[] = [];
    for (let copy = 0; copy < 2; copy++) {
      for (const c of this.crawl) {
        const px = h('span', { class: 'cr-px' });
        const chg = h('span', { class: 'cr-chg' });
        const item = h('span', { class: 'cr-item' }, h('b', null, c.id ?? 'RUSH 500'), px, chg);
        c.px.push(px);
        c.chg.push(chg);
        c.items.push(item);
        track.push(item);
      }
    }
    this.el.crawl.replaceChildren(...track);
    this.el.crawl.style.animationDuration = `${this.crawl.length * 4.5}s`;
  }

  update(s: HudState, now: number): void {
    const { market: m, desk } = s;
    const tk = m.get(s.selected);
    // Account bar.
    if (desk) {
      const pnl = desk.dayPnl(m);
      setText(this.el.pnl, signed(pnl));
      this.el.pnl.dataset.tone = tone(pnl);
      setText(this.el.equity, money(desk.equity(m), false));
      setText(this.el.bp, `BP ${money(desk.buyingPower(m), false)}`);
      // -1 at the risk limit, 0 flat, +1 at the goal.
      const k = Math.max(-1, Math.min(1, pnl >= 0 ? pnl / (desk.startEquity * GOAL) : pnl / (desk.startEquity * LOSS_LIMIT)));
      const f = this.el.meterFill.style;
      f.left = `${50 + Math.min(0, k) * 50}%`;
      f.width = `${Math.abs(k) * 50}%`;
      this.el.meterFill.dataset.tone = tone(pnl);
      this.el.meter.classList.toggle('hit', k >= 1);
      this.el.meter.hidden = false;
    } else {
      this.el.meter.hidden = true;
      setText(this.el.pnl, 'DEMO');
      this.el.pnl.dataset.tone = 'flat';
    }
    setText(this.el.clock, clockAt(Math.min(m.t, DAY_MINUTES - 0.01)));
    this.el.session.style.transform = `scaleX(${m.t / DAY_MINUTES})`;

    // Chart.
    const pos = desk?.positions.get(tk.def.id) ?? null;
    this.chart.draw(
      {
        tk,
        count: m.count,
        frac: s.frac,
        mode: s.chart,
        pos,
        pnl: desk ? desk.open(m, tk.def.id) : 0,
        fills: s.fills,
        news: m.news.filter((n) => n.id === tk.def.id || n.id === null),
        halted: tk.haltUntil !== null,
      },
      now,
    );
    const chg = tk.price / tk.prev - 1;
    setText(this.el.sym, tk.def.id);
    setText(this.el.co, tk.def.name);
    const last = priceText(tk.price);
    if (last !== this.lastShown) {
      const up = tk.price >= Number(this.lastShown || last);
      this.lastShown = last;
      this.el.last.dataset.tick = up ? 'up' : 'down';
      this.el.last.classList.remove('tick');
      void this.el.last.offsetWidth;
      this.el.last.classList.add('tick');
    }
    setText(this.el.last, last);
    for (const [mode, b] of this.modeBtns) {
      const on = mode === s.chart;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    setText(this.el.chg, `${chg >= 0 ? '▲' : '▼'} ${pctText(chg)}`);
    this.el.chg.dataset.tone = tone(chg);
    const halted = tk.haltUntil !== null;
    this.el.halt.hidden = !halted;
    if (halted) setText(this.el.haltSub, `Reopens in ${Math.max(0, (tk.haltUntil! - m.t) / s.pace).toFixed(1)}s`);

    // The breaking-news banner.
    if (now > this.breakingUntil) {
      const next = this.breakingQueue.shift();
      if (next) {
        this.breakingId = next.id;
        this.breakingUntil = now + 2800;
        this.el.breaking.replaceChildren(h('b', null, next.id ?? 'MARKET'), h('span', null, next.text));
        this.el.breaking.dataset.tone = next.id === null ? 'flat' : next.sign > 0 ? 'up' : 'down';
        this.el.breaking.hidden = false;
        this.el.breaking.classList.remove('in');
        void this.el.breaking.offsetWidth;
        this.el.breaking.classList.add('in');
      } else this.el.breaking.hidden = true;
    }

    this.ticket(s);
    if (s.selected !== this.chipShown) {
      this.chipShown = s.selected;
      this.chips.get(s.selected)?.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      this.listsAt = 0;
    }
    if (now - this.listsAt < 120) return;
    this.listsAt = now;
    this.lists(s);
  }

  private ticket(s: HudState): void {
    const { market: m, desk } = s;
    const id = s.selected;
    const q = m.quote(id);
    const pos = desk?.positions.get(id);
    for (const [sid, b] of this.sizeBtns) {
      const on = sid === s.size;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    if (!desk) {
      setText(this.el.pos, 'Demo market. Start a day to trade.');
      this.el.pos.dataset.tone = 'flat';
      setDisabled(this.el.buy, true);
      setDisabled(this.el.sell, true);
      setDisabled(this.el.flatAll, true);
      return;
    }
    const can = !desk.locked && !q.halted && !m.done;
    setDisabled(this.el.buy, !can);
    setDisabled(this.el.sell, !can);
    setDisabled(this.el.flatAll, desk.positions.size === 0 || desk.locked || m.done);
    const want = Math.min(desk.buyingPower(m), desk.equity(m) * desk.opts.leverage * SIZES[s.size].share);
    const est = Math.floor((want * 0.995) / q.ask);
    const entry = est > 0 ? `≈${est.toLocaleString('en-US')} sh · ${money(est * q.ask, false)}` : 'No buying power';
    if (!pos) {
      setText(this.el.pos, desk.locked ? 'The risk desk has your keys for today.' : q.halted ? `${id} is halted.` : `Flat · Bid ${priceText(q.bid)} × ${depth(m.count, id, 0)} · Ask ${priceText(q.ask)} × ${depth(m.count, id, 1)}`);
      this.el.pos.dataset.tone = 'flat';
      setText(this.el.buyAct, 'BUY');
      setText(this.el.sellAct, 'SHORT');
      setText(this.el.buySub, entry);
      setText(this.el.sellSub, entry);
      this.el.buy.dataset.mode = this.el.sell.dataset.mode = 'open';
      return;
    }
    const pnl = desk.open(m, id);
    const long = pos.qty > 0;
    const shares = Math.abs(pos.qty).toLocaleString('en-US');
    setText(this.el.pos, `${long ? 'LONG' : 'SHORT'} ${shares} @ ${priceText(pos.avg)}  ${signed(pnl)} (${pctText((pnl / (Math.abs(pos.qty) * pos.avg)) || 0)})`);
    this.el.pos.dataset.tone = tone(pnl);
    setText(this.el.buyAct, long ? 'BUY MORE' : 'COVER');
    setText(this.el.sellAct, long ? 'SELL ALL' : 'SHORT MORE');
    setText(this.el.buySub, long ? entry : `close ${shares} · ${signed(pnl, false)}`);
    setText(this.el.sellSub, long ? `close ${shares} · ${signed(pnl, false)}` : entry);
    this.el.buy.dataset.mode = long ? 'open' : 'close';
    this.el.sell.dataset.mode = long ? 'close' : 'open';
  }

  private lists(s: HudState): void {
    const { market: m, desk } = s;
    for (const tk of m.tickers) {
      const chip = this.chips.get(tk.def.id);
      if (!chip) continue;
      const chg = tk.price / tk.prev - 1;
      const px = priceText(tk.price);
      if (px !== chip.shown) {
        // A quick flash on each tick, at most a few times a second per chip.
        if (chip.shown && performance.now() - chip.flashAt > 700) {
          chip.flashAt = performance.now();
          chip.px.dataset.tick = tk.price > Number(chip.shown) ? 'up' : 'down';
          chip.px.classList.remove('tick');
          void chip.px.offsetWidth;
          chip.px.classList.add('tick');
        }
        chip.shown = px;
      }
      setText(chip.px, px);
      setText(chip.chg, pctText(chg));
      chip.el.dataset.tone = tone(chg);
      chip.el.classList.toggle('on', tk.def.id === s.selected);
      chip.el.classList.toggle('halted', tk.haltUntil !== null);
      const p = desk?.positions.get(tk.def.id);
      setText(chip.badge, tk.haltUntil !== null ? 'HALT' : p ? `${p.qty > 0 ? 'L' : 'S'} ${Math.abs(p.qty) >= 1000 ? `${(Math.abs(p.qty) / 1000).toFixed(1)}k` : Math.abs(p.qty)}` : '');
      chip.badge.dataset.tone = tk.haltUntil !== null ? 'halt' : p ? tone(desk!.open(m, tk.def.id)) : 'flat';
      if (chip.candles !== tk.candles.length || tk.candles.length < 3) {
        chip.candles = tk.candles.length;
        const cs = tk.candles;
        let lo = Infinity;
        let hi = -Infinity;
        for (const k of cs) {
          lo = Math.min(lo, k.c, tk.prev);
          hi = Math.max(hi, k.c, tk.prev);
        }
        const span = Math.max(hi - lo, tk.price * 0.004);
        const n = Math.max(2, cs.length);
        chip.spark.setAttribute('points', cs.map((k, i) => `${((i / (n - 1)) * 60).toFixed(1)},${(18 - ((k.c - lo) / span) * 16).toFixed(1)}`).join(' '));
      }
    }

    // The crawl.
    for (const c of this.crawl) {
      const price = c.id ? m.get(c.id).price : m.index.level;
      const base = c.id ? m.get(c.id).prev : m.index.open;
      const ch = price / base - 1;
      const pText = c.id ? priceText(price) : price.toFixed(1);
      const cText = `${ch >= 0 ? '▲' : '▼'}${Math.abs(ch * 100).toFixed(2)}%`;
      for (let i = 0; i < 2; i++) {
        setText(c.px[i], pText);
        setText(c.chg[i], cText);
        c.items[i].dataset.tone = tone(ch);
      }
    }

    // The wire: newest first.
    const last = m.news.length ? m.news[m.news.length - 1].n : -1;
    if (last !== this.newsShown) {
      this.newsShown = last;
      const items = m.news.slice(-8).reverse();
      this.el.news.replaceChildren(
        ...items.map((n) =>
          h(
            'li',
            { 'data-tone': n.id === null ? 'flat' : n.sign > 0 ? 'up' : 'down' },
            h('time', null, clockAt(n.t)),
            n.id ? h('button', { class: 'tag', type: 'button', onclick: () => this.act.select(n.id!) }, n.id) : h('span', { class: 'tag macro' }, 'MKT'),
            h('span', { class: 'txt' }, n.text),
          ),
        ),
      );
    }

    // The tape, with Level 2.
    this.el.tapeBox.classList.toggle('locked', !s.level2);
    if (!s.level2) {
      if (this.tapeShown !== 'locked') {
        this.tapeShown = 'locked';
        this.el.tape.replaceChildren(h('li', { class: 'lock' }, h('b', null, '🔒 Level 2 & tape'), h('span', null, 'See the whales coming. In Tools.')));
      }
      return;
    }
    const tape = m.get(s.selected).tape;
    const key = `${s.selected}:${tape.length}:${tape[tape.length - 1]?.t ?? 0}`;
    if (key === this.tapeShown) return;
    this.tapeShown = key;
    this.el.tape.replaceChildren(
      ...tape
        .slice(-14)
        .reverse()
        .map((p) =>
          h(
            'li',
            { class: p.whale ? 'whale' : '', 'data-tone': p.side > 0 ? 'up' : 'down' },
            h('span', { class: 'tp' }, priceText(p.price)),
            h('span', { class: 'ts' }, `${p.whale ? '🐋 ' : ''}${p.size >= 10_000 ? `${(p.size / 1000).toFixed(0)}k` : p.size.toLocaleString('en-US')}`),
          ),
        ),
    );
  }

  /** A headline for the banner over the chart. */
  breaking(n: News): void {
    if (n.kind === 'gap') return;
    this.breakingQueue.push(n);
    if (this.breakingQueue.length > 3) this.breakingQueue.shift();
    if (n.id) {
      const chip = this.chips.get(n.id);
      if (chip) {
        chip.el.classList.remove('ping');
        void chip.el.offsetWidth;
        chip.el.classList.add('ping');
      }
    }
  }

  /** Text that floats up over the chart. */
  float(text: string, kind: 'up' | 'down' | 'info' | 'big'): void {
    const el = h('span', { class: `float ${kind}` }, text);
    this.el.floats.append(el);
    setTimeout(() => el.remove(), 1600);
  }

  banner(text: string, sub = '', kind: 'up' | 'down' | 'info' = 'info'): void {
    const b = this.el.banner;
    b.replaceChildren(h('b', null, text), sub ? h('small', null, sub) : '');
    b.dataset.tone = kind;
    b.hidden = false;
    b.classList.remove('in');
    void b.offsetWidth;
    b.classList.add('in');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (b.hidden = true), 1900);
  }

  toast(text: string, ms = 3200): void {
    const t = this.el.toast;
    setText(t, text);
    t.hidden = false;
    t.classList.remove('in');
    void t.offsetWidth;
    t.classList.add('in');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), ms);
  }

  /** Confetti over the chart, for a big win or the day's goal. */
  confetti(): void {
    const colors = ['#22e39a', '#ffd23f', '#60a5fa', '#ff6fb5', '#ffffff'];
    for (let i = 0; i < 28; i++) {
      const el = h('i', { class: 'confetto' });
      el.style.left = `${10 + Math.random() * 80}%`;
      el.style.background = colors[i % colors.length];
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
      el.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      el.style.animationDelay = `${Math.random() * 0.15}s`;
      this.el.floats.append(el);
      setTimeout(() => el.remove(), 1700);
    }
  }
}
