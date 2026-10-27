// The market for one trading day: a seeded sim stepped STEP market minutes
// at a time, so the same seed always plays the same day (until your own
// orders push the price around). Everything that makes day trading fun is
// in here somewhere:
//
// - Regimes: each stock chops, trends up or trends down for a while, and
//   trends last long enough to ride. A meme stock can squeeze, then fade.
// - News: headlines hit the wire and the price reacts a moment later,
//   overshooting and settling. Rumors get denied; good earnings get sold.
// - Halts: a move too big inside 5 minutes freezes the stock, then it
//   reopens with a gap.
// - Gappers: a stock or two opens far from yesterday's close on overnight
//   news, then either keeps going or fills the gap.
// - The clock: busy at the open, sleepy at lunch, busy again in power hour.
// - Whales: before a trend starts, big prints show up on the tape.
import { mulberry32 } from '@shared/rng';
import {
  BANKS,
  CANDLE,
  DAY_MINUTES,
  DENIALS,
  DENY_CHANCE,
  GAP_NEWS,
  HALT_MINUTES,
  INDEX_VOL,
  MACRO,
  MACRO_MOVE,
  NEWS,
  NEWS_MOVE,
  POWER_HOUR,
  SELL_THE_NEWS,
  SOLD_NEWS,
  SQUEEZE_NEWS,
  STEP,
  STOCK,
  type NewsKind,
  type NewsSize,
  type StockDef,
  type StockId,
} from './defs';

export interface Candle {
  /** Market minute it opened. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Shares traded. */
  v: number;
  /** The day's VWAP as of this candle. */
  w: number;
}

export interface Print {
  t: number;
  price: number;
  size: number;
  side: 1 | -1;
  /** A whale-size order: someone knows something. */
  whale: boolean;
}

export interface News {
  /** Order on the wire. */
  n: number;
  t: number;
  /** Null for news that moves the whole market. */
  id: StockId | null;
  text: string;
  sign: 1 | -1;
  size: NewsSize;
  kind: NewsKind | 'deny' | 'sold' | 'squeeze' | 'gap';
}

export type Regime = 'chop' | 'up' | 'down' | 'squeeze' | 'fade';

/** Drift (in sigmas per minute), vol multiplier and typical length in minutes. */
export const REGIMES: Record<Regime, { drift: number; vol: number; mean: number }> = {
  chop: { drift: 0, vol: 0.8, mean: 30 },
  up: { drift: 0.32, vol: 1, mean: 24 },
  down: { drift: -0.32, vol: 1, mean: 24 },
  squeeze: { drift: 1, vol: 1.7, mean: 16 },
  fade: { drift: -0.6, vol: 1.4, mean: 20 },
};

/** Pull back toward VWAP while chopping, per minute. */
const CHOP_REVERT = 0.04;
/** Price ring for halts: 5 minutes of steps. */
const RING = Math.round(5 / STEP);
const STEPS_PER_CANDLE = Math.round(CANDLE / STEP);
const STEPS_PER_DAY = Math.round(DAY_MINUTES / STEP);
const TAPE = 60;
/** Dollar volume per market minute, as a share of a stock's liquidity. */
const TURNOVER = 1 / 50;
const MIN_PRICE = 0.1;
/** Chance per step of a whale print in the 4 minutes before a trend, and of a decoy any time. */
const WHALE_TELL = 0.03;
const WHALE_DECOY = 0.003;
/** Share of a news move the algos price in the moment it hits, and how often news fizzles. */
const INSTANT = 0.5;
const FIZZLE = 0.3;

interface Pulse {
  start: number;
  dur: number;
  /** Total log move, spread smoothly over [start, start + dur]. */
  move: number;
}

export interface Ticker {
  def: StockDef;
  /** Yesterday's close. */
  prev: number;
  open: number;
  price: number;
  high: number;
  low: number;
  /** Price × shares and shares, for VWAP. */
  pv: number;
  volume: number;
  /** Finished candles, then the live one. */
  candles: Candle[];
  tape: Print[];
  regime: Regime;
  regimeLeft: number;
  /** Picked when a regime starts, so the tape can hint at it. */
  next: Regime;
  /** Extra vol after news, fading. */
  boost: number;
  pulses: Pulse[];
  haltUntil: number | null;
  haltGap: number;
  halts: number;
  ring: number[];
  /** Overnight gap (log), 0 for most. */
  gap: number;
  /** Log vol per square-root minute. */
  sigma: number;
  /** Every tick of the day: the price, shares traded and VWAP after each step (index 0 is the open). */
  ticks: Float32Array;
  vols: Float32Array;
  vws: Float32Array;
}

export type DayEvent =
  | { kind: 'news'; news: News }
  | { kind: 'halt'; id: StockId; up: boolean }
  | { kind: 'resume'; id: StockId; gap: number }
  | { kind: 'candle' }
  | { kind: 'power' }
  | { kind: 'close' };

export interface DaySetup {
  seed: number;
  day: number;
  ids: readonly StockId[];
  /** Yesterday's closes (anything missing gets a fresh price). */
  closes: Partial<Record<StockId, number>>;
  /** Extra market minutes between a headline and the price reacting (News squawk). */
  lead: number;
}

interface Plan {
  at: number;
  run: () => void;
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** How busy the market is at minute t: busy open, sleepy lunch, busy close. */
export function busyness(t: number): number {
  return 0.72 + Math.exp(-t / 20) + 0.45 * smooth((t - 300) / 90);
}

/** Bid and ask around a price, to the cent. */
export function spreadOf(def: StockDef, price: number): { bid: number; ask: number } {
  const half = Math.max(0.005, (price * def.spreadBps) / 2e4);
  const bid = Math.floor((price - half) * 100) / 100;
  let ask = Math.ceil((price + half) * 100) / 100;
  if (ask <= bid) ask = bid + 0.01;
  return { bid: Math.max(0.01, bid), ask };
}

export class Market {
  /** Market minutes since the open. */
  t = 0;
  /** Steps since the open (the clock is counted, not summed, so candles land on the minute). */
  private n = 0;
  readonly tickers: Ticker[];
  readonly news: News[] = [];
  /** The index, starting at 100 points... of whatever it was yesterday. */
  index = { open: 0, level: 0 };
  private rnd: () => number;
  private spare: number | null = null;
  private plans: Plan[] = [];
  private indexPulses: Pulse[] = [];
  private byId = new Map<StockId, Ticker>();
  private powerSaid = false;
  private closed = false;
  private wire = 0;

  constructor(readonly setup: DaySetup) {
    this.rnd = mulberry32((setup.seed ^ Math.imul(setup.day + 1, 0x9e3779b1)) >>> 0);
    const r = this.rnd;
    this.index.open = this.index.level = 4000 * Math.exp((r() - 0.5) * 0.02);
    this.tickers = setup.ids.map((id) => {
      const def = STOCK[id];
      const prev = setup.closes[id] ?? def.price[0] + (def.price[1] - def.price[0]) * r();
      const open = prev * Math.exp(this.gauss() * def.vol * 0.2);
      const tk: Ticker = {
        def,
        prev,
        open,
        price: open,
        high: open,
        low: open,
        pv: 0,
        volume: 0,
        candles: [{ t: 0, o: open, h: open, l: open, c: open, v: 0, w: open }],
        tape: [],
        regime: 'chop',
        regimeLeft: 0,
        next: 'chop',
        boost: 1.3,
        pulses: [],
        haltUntil: null,
        haltGap: 0,
        halts: 0,
        ring: [],
        gap: 0,
        sigma: def.vol / Math.sqrt(DAY_MINUTES),
        ticks: new Float32Array(STEPS_PER_DAY + 1),
        vols: new Float32Array(STEPS_PER_DAY + 1),
        vws: new Float32Array(STEPS_PER_DAY + 1),
      };
      this.setRegime(tk, this.pickNext('chop'), this.length('chop'));
      this.byId.set(id, tk);
      return tk;
    });
    this.planGappers();
    this.planNews();
    this.planSqueeze();
    this.plans.sort((a, b) => a.at - b.at);
    for (const tk of this.tickers) this.record(tk);
  }

  /** Ticks recorded so far (the open counts as one). */
  get count(): number {
    return this.n + 1;
  }

  private record(tk: Ticker): void {
    tk.ticks[this.n] = tk.price;
    tk.vws[this.n] = this.vwap(tk);
  }

  get(id: StockId): Ticker {
    const tk = this.byId.get(id);
    if (!tk) throw new Error(`${id} is not on today's list`);
    return tk;
  }

  has(id: StockId): boolean {
    return this.byId.has(id);
  }

  get done(): boolean {
    return this.closed;
  }

  quote(id: StockId): { bid: number; ask: number; price: number; halted: boolean } {
    const tk = this.get(id);
    return { ...spreadOf(tk.def, tk.price), price: tk.price, halted: tk.haltUntil !== null };
  }

  vwap(tk: Ticker): number {
    return tk.volume > 0 ? tk.pv / tk.volume : tk.open;
  }

  /** Your order leans on the price (a fraction, + up). */
  push(id: StockId, frac: number): void {
    const tk = this.get(id);
    if (tk.haltUntil !== null) return;
    tk.price = Math.max(MIN_PRICE, tk.price * (1 + frac));
    this.touch(tk);
    this.record(tk);
  }

  /** Advance one step. */
  step(): DayEvent[] {
    const out: DayEvent[] = [];
    if (this.closed) return out;
    const t0 = this.n * STEP;
    this.n++;
    const t1 = this.n >= STEPS_PER_DAY ? DAY_MINUTES : this.n * STEP;
    while (this.plans.length && this.plans[0].at <= t1) {
      const p = this.plans.shift()!;
      this.t = Math.max(t0, p.at);
      const before = this.news.length;
      p.run();
      for (let i = before; i < this.news.length; i++) out.push({ kind: 'news', news: this.news[i] });
    }
    this.t = t1;

    // The index: a gentle walk plus macro news.
    const busy = busyness(t1);
    const dIdx = INDEX_VOL / Math.sqrt(DAY_MINUTES) * Math.sqrt(STEP) * busy * this.gauss() + pulseStep(this.indexPulses, t0, t1);
    this.index.level *= Math.exp(dIdx);

    const candleStart = this.n % STEPS_PER_CANDLE === 0 && this.n < STEPS_PER_DAY;
    for (const tk of this.tickers) this.stepTicker(tk, t0, t1, dIdx, busy, out);
    for (const tk of this.tickers) this.record(tk);
    if (candleStart) {
      for (const tk of this.tickers) tk.candles.push({ t: t1, o: tk.price, h: tk.price, l: tk.price, c: tk.price, v: 0, w: this.vwap(tk) });
      out.push({ kind: 'candle' });
    }
    if (!this.powerSaid && t1 >= POWER_HOUR) {
      this.powerSaid = true;
      out.push({ kind: 'power' });
    }
    if (this.n >= STEPS_PER_DAY) {
      this.closed = true;
      // Anything still halted reopens for the closing print.
      for (const tk of this.tickers) {
        if (tk.haltUntil === null) continue;
        tk.haltUntil = null;
        tk.price = Math.max(MIN_PRICE, tk.price * Math.exp(tk.haltGap));
        this.touch(tk);
        this.record(tk);
      }
      out.push({ kind: 'close' });
    }
    return out;
  }

  private stepTicker(tk: Ticker, t0: number, t1: number, dIdx: number, busy: number, out: DayEvent[]): void {
    const live = tk.candles[tk.candles.length - 1];
    if (tk.haltUntil !== null) {
      if (t1 < tk.haltUntil) return;
      tk.haltUntil = null;
      tk.price = Math.max(MIN_PRICE, tk.price * Math.exp(tk.haltGap));
      tk.ring = [];
      this.touch(tk);
      out.push({ kind: 'resume', id: tk.def.id, gap: Math.exp(tk.haltGap) - 1 });
      return;
    }
    const reg = REGIMES[tk.regime];
    const sig = tk.sigma * busy * reg.vol * tk.boost;
    const z = this.gauss();
    let d = tk.def.beta * dIdx + reg.drift * tk.sigma * STEP + sig * Math.sqrt(STEP) * z + pulseStep(tk.pulses, t0, t1);
    if (tk.regime === 'chop') d += CHOP_REVERT * Math.log(this.vwap(tk) / tk.price) * STEP;
    const before = tk.price;
    tk.price = Math.max(MIN_PRICE, tk.price * Math.exp(d));

    // Volume and prints: busier when it moves.
    const r = this.rnd;
    const move = Math.abs(Math.log(tk.price / before)) / Math.max(1e-9, tk.sigma * Math.sqrt(STEP));
    const dollars = tk.def.liquidity * TURNOVER * STEP * busy * tk.boost * (0.6 + 0.8 * r()) * (1 + 0.5 * move);
    const shares = Math.max(1, Math.round(dollars / tk.price));
    tk.volume += shares;
    tk.pv += shares * tk.price;
    live.v += shares;
    tk.vols[this.n] = shares;
    const dir: 1 | -1 = tk.price >= before ? 1 : -1;
    const prints = 1 + Math.floor(r() * 3);
    for (let i = 0; i < prints; i++) {
      const side: 1 | -1 = r() < 0.68 ? dir : (-dir as 1 | -1);
      this.print(tk, { t: t1, price: tk.price, size: Math.max(1, Math.round((shares / prints) * (0.4 + r() * 1.2))), side, whale: false });
    }
    // Whales get in just before a trend... and now and then one is just a big order.
    const comingTrend = tk.next === 'up' || tk.next === 'down' || tk.next === 'squeeze';
    const tell = comingTrend && tk.regimeLeft < 4 && r() < WHALE_TELL;
    if (tell || r() < WHALE_DECOY) {
      const side: 1 | -1 = tell ? (tk.next === 'down' ? -1 : 1) : r() < 0.5 ? 1 : -1;
      this.print(tk, { t: t1, price: tk.price, size: Math.round(shares * (8 + r() * 12)), side, whale: true });
    }
    this.touch(tk);

    tk.boost = 1 + (tk.boost - 1) * Math.exp(-STEP / 8);
    tk.regimeLeft -= STEP;
    if (tk.regimeLeft <= 0) this.setRegime(tk, tk.next, this.length(tk.next));

    // Limit up, limit down.
    tk.ring.push(tk.price);
    if (tk.ring.length > RING) tk.ring.shift();
    const ref = tk.ring[0];
    if (t1 > 1 && t1 < DAY_MINUTES - 1 && Math.abs(tk.price / ref - 1) > tk.def.band) this.halt(tk, tk.price > ref, out);
  }

  private halt(tk: Ticker, up: boolean, out: DayEvent[]): void {
    const r = this.rnd;
    tk.halts++;
    tk.haltUntil = Math.min(DAY_MINUTES - 0.5, this.t + HALT_MINUTES);
    // Whatever news hadn't finished moving it lands in the reopening gap.
    let pending = 0;
    for (const p of tk.pulses) pending += p.move * (1 - smooth((this.t - p.start) / p.dur));
    tk.pulses = [];
    const keepGoing = r() < 0.6;
    const size = tk.def.band * (keepGoing ? 0.2 + r() * 0.6 : 0.2 + r() * 0.4);
    tk.haltGap = pending + (up === keepGoing ? size : -size);
    tk.ring = [];
    out.push({ kind: 'halt', id: tk.def.id, up });
  }

  private print(tk: Ticker, p: Print): void {
    tk.tape.push(p);
    if (tk.tape.length > TAPE) tk.tape.shift();
  }

  private touch(tk: Ticker): void {
    const live = tk.candles[tk.candles.length - 1];
    live.c = tk.price;
    live.w = this.vwap(tk);
    if (tk.price > live.h) live.h = tk.price;
    if (tk.price < live.l) live.l = tk.price;
    if (tk.price > tk.high) tk.high = tk.price;
    if (tk.price < tk.low) tk.low = tk.price;
  }

  // -------------------------------------------------------------------------
  // Regimes

  private setRegime(tk: Ticker, regime: Regime, minutes: number): void {
    tk.regime = regime;
    tk.regimeLeft = minutes;
    tk.next = this.pickNext(regime);
  }

  private pickNext(from: Regime): Regime {
    const r = this.rnd();
    switch (from) {
      case 'chop':
        return r < 0.32 ? 'up' : r < 0.64 ? 'down' : 'chop';
      case 'up':
        return r < 0.6 ? 'chop' : r < 0.75 ? 'up' : 'down';
      case 'down':
        return r < 0.6 ? 'chop' : r < 0.75 ? 'down' : 'up';
      case 'squeeze':
        return r < 0.8 ? 'fade' : 'chop';
      case 'fade':
        return r < 0.8 ? 'chop' : 'down';
    }
  }

  private length(regime: Regime): number {
    return Math.min(70, Math.max(6, -REGIMES[regime].mean * Math.log(1 - this.rnd())));
  }

  // -------------------------------------------------------------------------
  // The day's plan: gappers, headlines, maybe a squeeze.

  private publish(id: StockId | null, text: string, sign: 1 | -1, size: NewsSize, kind: News['kind']): void {
    this.news.push({ n: this.wire++, t: this.t, id, text, sign, size, kind });
  }

  /** Fill in a headline. Done while planning the day, so seeing it early never changes the prices. */
  private fill(text: string, def: StockDef | null, sign: 1 | -1): string {
    const r = this.rnd;
    const price = def ? this.byId.get(def.id)?.prev ?? def.price[0] : 0;
    const pt = Math.max(1, Math.round(price * (1 + sign * (0.15 + r() * 0.25))));
    const est = 0.5 + r() * 2;
    return text
      .replaceAll('{name}', def?.name ?? '')
      .replaceAll('{id}', def?.id ?? '')
      .replaceAll('{bank}', BANKS[Math.floor(r() * BANKS.length)])
      .replaceAll('{pt}', String(pt))
      .replaceAll('{est}', est.toFixed(2))
      .replaceAll('{eps}', (est * (1.2 + r() * 0.5)).toFixed(2));
  }

  /** A headline now, then the price reacting `lead` + a moment later. */
  private plan(at: number, run: () => void): void {
    this.plans.push({ at, run });
  }

  private react(tk: Ticker, move: number, at: number, follow: boolean): void {
    const r = this.rnd;
    const dur = 2 + r() * 5;
    // The algos jump first, then the crowd piles in and overshoots, then it settles.
    tk.pulses.push({ start: at, dur: 0.6, move: move * INSTANT });
    tk.pulses.push({ start: at + 0.3, dur, move: move * (1.4 - INSTANT) });
    tk.pulses.push({ start: at + 0.3 + dur, dur: dur * 2, move: -move * 0.5 });
    tk.boost = Math.max(tk.boost, 1.6 + Math.abs(move) / tk.def.vol);
    if (follow && r() < 0.45) this.setRegime(tk, move > 0 ? 'up' : 'down', 10 + r() * 15);
  }

  private planGappers(): void {
    const r = this.rnd;
    // Newsier stocks are likelier to gap.
    const keyed = this.tickers.map((tk) => ({ tk, key: tk.def.newsy * r() }));
    const pool = keyed.sort((a, b) => b.key - a.key).map((x) => x.tk);
    const n = Math.min(pool.length, 1 + (r() < 0.4 ? 1 : 0));
    for (const tk of pool.slice(0, n)) {
      const sign: 1 | -1 = r() < 0.5 ? 1 : -1;
      tk.gap = sign * (0.5 + r()) * tk.def.vol;
      tk.open = tk.price = tk.high = tk.low = tk.prev * Math.exp(tk.gap);
      tk.candles = [{ t: 0, o: tk.open, h: tk.open, l: tk.open, c: tk.open, v: 0, w: tk.open }];
      tk.boost = 2;
      const lines = GAP_NEWS[sign];
      this.publish(tk.def.id, this.fill(lines[Math.floor(r() * lines.length)], tk.def, sign), sign, 'big', 'gap');
      // Gap and go, or fill the gap.
      const go = r() < 0.55;
      const up = go === sign > 0;
      this.setRegime(tk, up ? 'up' : 'down', 15 + r() * 20);
    }
  }

  private planNews(): void {
    const r = this.rnd;
    const lead = this.setup.lead;
    const total = this.tickers.reduce((s, tk) => s + tk.def.newsy, 0);
    const count = 7 + Math.floor(r() * 5);
    for (let i = 0; i < count; i++) {
      let pick = r() * total;
      let tk = this.tickers[this.tickers.length - 1];
      for (const x of this.tickers) {
        pick -= x.def.newsy;
        if (pick < 0) {
          tk = x;
          break;
        }
      }
      const fits = NEWS.filter((n) => !n.sectors || n.sectors.includes(tk.def.sector));
      const tpl = fits[Math.floor(r() * fits.length)];
      // Some news was priced in already: it barely moves, or moves the wrong way.
      const fizzle = r() < FIZZLE;
      const move = tpl.sign * NEWS_MOVE[tpl.size] * tk.def.vol * (fizzle ? (r() - 0.5) * 0.6 : 0.75 + r() * 0.5);
      const delay = 0.4 + r() * 1.2;
      const at = Math.max(1 + delay + lead, 6 + r() * (DAY_MINUTES - 14));
      const id = tk.def.id;
      const sold = tpl.kind === 'earnings' && tpl.sign > 0 && r() < SELL_THE_NEWS;
      const denied = !!tpl.rumor && r() < DENY_CHANCE;
      const later = 6 + r() * 9;
      const headline = this.fill(tpl.text, tk.def, tpl.sign);
      this.plan(at - delay - lead, () => this.publish(id, headline, tpl.sign, tpl.size, tpl.kind));
      this.plan(at, () => {
        if (tk.haltUntil !== null) return;
        this.react(tk, sold ? move * 0.5 : move, this.t, !sold && !denied && !fizzle);
      });
      if (sold || denied) {
        const back: 1 | -1 = tpl.sign > 0 ? -1 : 1;
        const lines = sold ? SOLD_NEWS : DENIALS;
        const text = this.fill(lines[Math.floor(r() * lines.length)], tk.def, back);
        const t2 = at + later;
        const d2 = 0.4 + r();
        this.plan(t2 - d2 - lead, () => this.publish(id, text, back, tpl.size, sold ? 'sold' : 'deny'));
        this.plan(t2, () => {
          if (tk.haltUntil !== null) return;
          this.react(tk, sold ? -move * 1.1 : -move * 0.85, this.t, false);
        });
      }
    }
    // A headline or two for the whole market.
    const macros = 1 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < macros; i++) {
      const tpl = MACRO[Math.floor(r() * MACRO.length)];
      const move = tpl.sign * MACRO_MOVE[tpl.size] * (0.8 + r() * 0.4);
      const delay = 0.4 + r();
      const at = Math.max(1 + delay + lead, 20 + r() * (DAY_MINUTES - 40));
      this.plan(at - delay - lead, () => this.publish(null, tpl.text, tpl.sign, tpl.size, 'macro'));
      this.plan(at, () => {
        const dur = 3 + r() * 4;
        this.indexPulses.push({ start: this.t, dur, move });
        for (const tk of this.tickers) tk.boost = Math.max(tk.boost, 1.4);
      });
    }
  }

  private planSqueeze(): void {
    const r = this.rnd;
    const memes = this.tickers.filter((tk) => tk.def.meme);
    if (!memes.length || r() >= 0.35) return;
    const tk = memes[Math.floor(r() * memes.length)];
    const at = 60 + r() * 240;
    const lead = this.setup.lead;
    const text = this.fill(SQUEEZE_NEWS[Math.floor(r() * SQUEEZE_NEWS.length)], tk.def, 1);
    this.plan(at - 1 - lead, () => this.publish(tk.def.id, text, 1, 'big', 'squeeze'));
    this.plan(at, () => {
      if (tk.haltUntil !== null) return;
      this.setRegime(tk, 'squeeze', 12 + r() * 8);
      tk.next = 'fade';
      tk.boost = Math.max(tk.boost, 1.5);
    });
  }

  private gauss(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.rnd();
    const v = this.rnd();
    const m = Math.sqrt(-2 * Math.log(u));
    this.spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  }
}

/** The part of each pulse's move that falls between t0 and t1; finished pulses drop off. */
function pulseStep(pulses: Pulse[], t0: number, t1: number): number {
  let d = 0;
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    d += p.move * (smooth((t1 - p.start) / p.dur) - smooth((t0 - p.start) / p.dur));
    if (t1 >= p.start + p.dur) pulses.splice(i, 1);
  }
  return d;
}
