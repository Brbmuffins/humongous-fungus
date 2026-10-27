// The chart for the stock you're watching, in three modes:
// - LIVE: every tick as a line that scrolls with the clock, gliding between
//   ticks, with a glowing head, VWAP and per-minute volume.
// - 1M and 5M: candles, with VWAP and volume.
// All of them show yesterday's close, your position and its brackets, your
// fills and the news. Canvas 2D, redrawn every frame; the price range eases
// so it doesn't jitter, but always widens at once to fit a new high or low.
import { CANDLE, DAY_MINUTES, STEP } from './defs';
import type { Position } from './desk';
import type { Candle, News, Ticker } from './market';

export type ChartMode = 'live' | '1m' | '5m';
export const CHART_MODES: readonly ChartMode[] = ['live', '1m', '5m'];

export interface Mark {
  t: number;
  price: number;
  side: 1 | -1;
}

export interface ChartData {
  tk: Ticker;
  /** Ticks recorded so far. */
  count: number;
  /** How far the clock is toward the next tick, 0–1 (for gliding). */
  frac: number;
  mode: ChartMode;
  pos: Position | null;
  /** Open P&L on the position. */
  pnl: number;
  fills: readonly Mark[];
  /** Headlines for this stock and the whole market. */
  news: readonly News[];
  halted: boolean;
}

const COL = {
  up: '#22e39a',
  down: '#ff4d6d',
  grid: 'rgba(140,160,200,0.09)',
  text: '#7f8ea8',
  vwap: '#ffd23f',
  prev: 'rgba(200,210,230,0.4)',
  ink: '#071019',
};
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const TAU = Math.PI * 2;

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Market minute to a clock: 0 is 9:30. */
export function clockAt(t: number, ampm = false): string {
  const m = 9 * 60 + 30 + Math.floor(t + 1e-6);
  const h = Math.floor(m / 60);
  const hh = ampm ? ((h + 11) % 12) + 1 : h;
  return `${hh}:${pad2(m % 60)}${ampm ? (h >= 12 ? ' PM' : ' AM') : ''}`;
}

export const priceText = (p: number) => (p >= 1000 ? p.toFixed(1) : p.toFixed(2));

/** Candles of `minutes` each, built from the ticks, for the last `slots` of them. */
export function candlesFromTicks(tk: Ticker, count: number, minutes: number, slots: number): { candles: Candle[]; first: number } {
  const per = Math.round(minutes / STEP);
  const last = count - 1;
  const total = Math.floor(Math.max(0, last - 1) / per) + 1;
  const first = Math.max(0, total - slots);
  const out: Candle[] = [];
  for (let i = first; i < total; i++) {
    const a = i * per;
    const b = Math.min(last, (i + 1) * per);
    let h = tk.ticks[a];
    let l = tk.ticks[a];
    let v = 0;
    for (let j = a; j <= b; j++) {
      const p = tk.ticks[j];
      if (p > h) h = p;
      if (p < l) l = p;
      if (j > a) v += tk.vols[j];
    }
    out.push({ t: i * minutes, o: tk.ticks[a], h, l, c: tk.ticks[b], v, w: tk.vws[b] });
  }
  return { candles: out, first };
}

/** A line through the points, rounded at each one (through the midpoints between them). */
function smoothPath(c: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], continuing = false): void {
  if (!pts.length) return;
  if (!continuing) c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = pts[pts.length - 1];
  c.lineTo(last[0], last[1]);
}

interface Frame {
  plotW: number;
  plotH: number;
  priceH: number;
  volH: number;
  top: number;
  axis: number;
  timeH: number;
}

export class CandleChart {
  private c: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private lo = 0;
  private hi = 0;
  private shown = '';
  private lastPrice = 0;
  private flash = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.c = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(200, r.width);
    this.h = Math.max(120, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  draw(d: ChartData, now: number): void {
    const { c, w, h } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const axis = w < 420 ? 50 : 58;
    const timeH = 16;
    const plotW = w - axis;
    const plotH = h - timeH;
    const volH = Math.round(plotH * 0.15);
    const f: Frame = { plotW, plotH, priceH: plotH - volH - 4, volH, top: 6, axis, timeH };
    if (d.mode === 'live') this.live(d, f, now);
    else this.candles(d, f, now);
  }

  // -------------------------------------------------------------------------
  // LIVE: the tick line

  private live(d: ChartData, f: Frame, now: number): void {
    const { c } = this;
    const tk = d.tk;
    const win = this.w < 600 ? 30 : 45;
    const head = d.count - 1;
    // The head glides from the previous tick to the latest one, so the line
    // is drawn one tick behind the sim (about 1/20 s) and never jumps.
    const frac = head >= 1 ? Math.min(1, Math.max(0, d.frac)) : 1;
    const ht = Math.max(0, (head - 1 + frac) * STEP);
    const headPrice = head >= 1 ? tk.ticks[head - 1] + (tk.ticks[head] - tk.ticks[head - 1]) * frac : tk.ticks[0];
    const reach = f.plotW * 0.86;
    const t0 = ht - win;
    const xOfT = (t: number) => (reach * (t - t0)) / win;
    const i0 = Math.max(0, Math.floor(t0 / STEP));
    const i1 = Math.max(0, head - 1);

    let lo = headPrice;
    let hi = headPrice;
    for (let i = i0; i <= i1; i++) {
      const p = tk.ticks[i];
      if (p < lo) lo = p;
      if (p > hi) hi = p;
      const vw = tk.vws[i];
      if (vw > 0 && vw < lo) lo = vw;
      if (vw > hi) hi = vw;
    }
    // Never zoom in past the stock's usual swing over the window, so a quiet
    // spell looks quiet instead of filling the chart with wiggles.
    const usual = 1.5 * tk.def.vol * Math.sqrt(win / DAY_MINUTES);
    const { yAt } = this.range(d, f, lo, hi, Math.max(0.006, usual), `live:${tk.def.id}`);
    this.grid(f, yAt);

    // Time: every 5 minutes.
    c.fillStyle = COL.text;
    c.strokeStyle = COL.grid;
    c.lineWidth = 1;
    c.font = `500 10px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.beginPath();
    for (let t = Math.ceil(Math.max(0, t0) / 5) * 5; t <= ht; t += 5) {
      const x = Math.round(xOfT(t)) + 0.5;
      c.moveTo(x, f.top);
      c.lineTo(x, f.plotH);
      c.fillText(clockAt(t), Math.max(16, Math.min(f.plotW - 16, x)), f.plotH + f.timeH / 2 + 1);
    }
    c.stroke();
    this.prevClose(tk, f, yAt);

    // Volume, a bar per minute.
    const per = Math.round(1 / STEP);
    const bars: { x: number; v: number; up: boolean }[] = [];
    let maxV = 1;
    for (let m = Math.max(0, Math.floor(t0)); m * per <= head; m++) {
      const a = m * per;
      const b = Math.min(head, a + per);
      let v = 0;
      for (let j = a + 1; j <= b; j++) v += tk.vols[j];
      maxV = Math.max(maxV, v);
      bars.push({ x: xOfT(m + 0.5), v, up: tk.ticks[b] >= tk.ticks[a] });
    }
    const bw = Math.max(2, (reach / win) * 0.62);
    for (const b of bars) {
      if (b.x < -bw || b.x > f.plotW) continue;
      const vh = (b.v / maxV) * f.volH;
      c.fillStyle = b.up ? 'rgba(34,227,154,0.28)' : 'rgba(255,77,109,0.28)';
      c.fillRect(b.x - bw / 2, f.plotH - vh, bw, vh);
    }

    // VWAP.
    c.save();
    c.beginPath();
    c.rect(0, f.top, f.plotW, f.priceH - f.top);
    c.clip();
    c.strokeStyle = COL.vwap;
    c.globalAlpha = 0.75;
    c.lineWidth = 1.25;
    c.beginPath();
    for (let i = i0; i <= i1; i++) {
      const x = xOfT(i * STEP);
      const y = yAt(tk.vws[i]);
      if (i === i0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.globalAlpha = 1;

    // The line and the area under it, green or red on the day.
    const up = headPrice >= tk.prev;
    const col = up ? COL.up : COL.down;
    const pts: [number, number][] = [];
    for (let i = i0; i <= i1; i++) pts.push([xOfT(i * STEP), yAt(tk.ticks[i])]);
    const hx = xOfT(ht);
    const hy = yAt(headPrice);
    pts.push([hx, hy]);
    const area = c.createLinearGradient(0, f.top, 0, f.priceH);
    area.addColorStop(0, up ? 'rgba(34,227,154,0.28)' : 'rgba(255,77,109,0.28)');
    area.addColorStop(1, up ? 'rgba(34,227,154,0)' : 'rgba(255,77,109,0)');
    c.fillStyle = area;
    c.beginPath();
    c.moveTo(pts[0][0], f.priceH);
    c.lineTo(pts[0][0], pts[0][1]);
    smoothPath(c, pts, true);
    c.lineTo(hx, f.priceH);
    c.closePath();
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();
    smoothPath(c, pts);
    c.stroke();
    c.restore();
    if (pts.length > 2) {
      c.fillStyle = COL.vwap;
      c.font = `600 9px ${MONO}`;
      c.textAlign = 'left';
      const vy = yAt(tk.vws[i1]);
      c.fillText('VWAP', Math.min(f.plotW - 30, hx + 10), vy + (tk.vws[i1] > headPrice ? -8 : 8));
    }

    this.news(d, f, xOfT);
    this.fills(d, yAt, xOfT);
    this.levels(d, f, yAt);
    this.halted(d, f, now);

    // The head: a glowing dot with a ring that keeps pulsing while it trades.
    const pulse = (now % 900) / 900;
    const g = c.createRadialGradient(hx, hy, 0, hx, hy, 16);
    g.addColorStop(0, up ? 'rgba(34,227,154,0.55)' : 'rgba(255,77,109,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(hx - 16, hy - 16, 32, 32);
    if (!d.halted) {
      c.strokeStyle = col;
      c.globalAlpha = 1 - pulse;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(hx, hy, 4 + pulse * 10, 0, TAU);
      c.stroke();
      c.globalAlpha = 1;
    }
    c.fillStyle = col;
    c.beginPath();
    c.arc(hx, hy, 3.5, 0, TAU);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(hx, hy, 1.4, 0, TAU);
    c.fill();
    this.tag(f, yAt, headPrice, up, now, hx);
  }

  // -------------------------------------------------------------------------
  // 1M and 5M candles

  private candles(d: ChartData, f: Frame, now: number): void {
    const { c } = this;
    const tk = d.tk;
    const minutes = d.mode === '1m' ? 1 : CANDLE;
    const cw = Math.max(6, Math.min(14, f.plotW / 34));
    const slots = Math.max(8, Math.floor(f.plotW / cw) - 3);
    let vis: Candle[];
    let first: number;
    if (minutes === CANDLE) {
      first = Math.max(0, tk.candles.length - slots);
      vis = tk.candles.slice(first);
    } else ({ candles: vis, first } = candlesFromTicks(tk, d.count, minutes, slots));
    const xAt = (j: number) => (j + 0.5) * cw;
    const xOfT = (t: number) => xAt(t / minutes - first - 0.5);

    let lo = Infinity;
    let hi = -Infinity;
    for (const k of vis) {
      lo = Math.min(lo, k.l, k.w);
      hi = Math.max(hi, k.h, k.w);
    }
    const { yAt } = this.range(d, f, lo, hi, 0.008, `${d.mode}:${tk.def.id}`);
    this.grid(f, yAt);

    // Time: every half hour (every 5 minutes on 1M).
    const every = minutes === 1 ? 5 : 30;
    c.fillStyle = COL.text;
    c.strokeStyle = COL.grid;
    c.lineWidth = 1;
    c.font = `500 10px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.beginPath();
    vis.forEach((k, j) => {
      if (Math.round(k.t) % every !== 0) return;
      const x = Math.round(xAt(j)) + 0.5;
      c.moveTo(x, f.top);
      c.lineTo(x, f.plotH);
      c.fillText(clockAt(k.t), Math.max(16, Math.min(f.plotW - 16, x)), f.plotH + f.timeH / 2 + 1);
    });
    c.stroke();
    this.prevClose(tk, f, yAt);

    const maxV = Math.max(1, ...vis.map((k) => k.v));
    vis.forEach((k, j) => {
      const vh = (k.v / maxV) * f.volH;
      c.fillStyle = k.c >= k.o ? 'rgba(34,227,154,0.28)' : 'rgba(255,77,109,0.28)';
      c.fillRect(xAt(j) - cw * 0.32, f.plotH - vh, cw * 0.64, vh);
    });

    c.strokeStyle = COL.vwap;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.8;
    c.beginPath();
    vis.forEach((k, j) => (j ? c.lineTo(xAt(j), yAt(k.w)) : c.moveTo(xAt(j), yAt(k.w))));
    c.stroke();
    c.globalAlpha = 1;
    if (vis.length > 1) {
      const k = vis[vis.length - 1];
      c.fillStyle = COL.vwap;
      c.font = `600 9px ${MONO}`;
      c.textAlign = 'left';
      c.fillText('VWAP', Math.min(f.plotW - 30, xAt(vis.length - 1) + 8), yAt(k.w) + (k.w > tk.price ? -8 : 8));
    }

    vis.forEach((k, j) => {
      const x = xAt(j);
      const up = k.c >= k.o;
      const col = up ? COL.up : COL.down;
      if (j === vis.length - 1) {
        c.fillStyle = up ? 'rgba(34,227,154,0.1)' : 'rgba(255,77,109,0.1)';
        c.fillRect(x - cw / 2, f.top, cw, f.plotH - f.top);
      }
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.round(x) + 0.5, yAt(k.h));
      c.lineTo(Math.round(x) + 0.5, yAt(k.l));
      c.stroke();
      const y0 = yAt(Math.max(k.o, k.c));
      const y1 = yAt(Math.min(k.o, k.c));
      c.fillStyle = col;
      c.fillRect(x - cw * 0.32, y0, cw * 0.64, Math.max(1, y1 - y0));
    });

    this.news(d, f, xOfT);
    this.fills(d, yAt, xOfT);
    this.levels(d, f, yAt);
    this.halted(d, f, now);
    const open = vis[vis.length - 1]?.o ?? tk.price;
    this.tag(f, yAt, tk.price, tk.price >= open, now, null);
  }

  // -------------------------------------------------------------------------
  // Shared parts

  /** Fit the range to what's on screen (plus your levels), easing in, widening at once. */
  private range(d: ChartData, f: Frame, lo: number, hi: number, minShare: number, key: string): { yAt: (p: number) => number } {
    const levels = d.pos ? [d.pos.avg, d.pos.stop, d.pos.target].filter((x): x is number => x !== null) : [];
    for (const v of levels) {
      if (v > lo * 0.9 && v < hi * 1.1) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    const minRange = d.tk.price * minShare;
    if (hi - lo < minRange) {
      const mid = (hi + lo) / 2;
      lo = mid - minRange / 2;
      hi = mid + minRange / 2;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    if (this.shown !== key) {
      this.shown = key;
      this.lo = lo;
      this.hi = hi;
      this.lastPrice = d.tk.price;
    } else {
      this.lo = Math.min(lo, this.lo + (lo - this.lo) * 0.04);
      this.hi = Math.max(hi, this.hi + (hi - this.hi) * 0.04);
    }
    const a = this.lo;
    const b = this.hi;
    return { yAt: (p: number) => f.top + ((b - p) / (b - a)) * (f.priceH - f.top) };
  }

  private grid(f: Frame, yAt: (p: number) => number): void {
    const { c } = this;
    const lo = this.lo;
    const hi = this.hi;
    c.font = `500 10px ${MONO}`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    const raw = (hi - lo) / 5;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) ?? 10) * mag;
    c.strokeStyle = COL.grid;
    c.lineWidth = 1;
    c.fillStyle = COL.text;
    c.beginPath();
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
      const y = Math.round(yAt(p)) + 0.5;
      if (y > f.priceH) continue;
      c.moveTo(0, y);
      c.lineTo(f.plotW, y);
      c.fillText(priceText(p), f.plotW + 6, y);
    }
    c.stroke();
  }

  private prevClose(tk: Ticker, f: Frame, yAt: (p: number) => number): void {
    const { c } = this;
    if (tk.prev <= this.lo || tk.prev >= this.hi) return;
    const y = Math.round(yAt(tk.prev)) + 0.5;
    c.strokeStyle = COL.prev;
    c.setLineDash([2, 4]);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(f.plotW, y);
    c.stroke();
    c.setLineDash([]);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = `600 9px ${MONO}`;
    const lw = c.measureText('PREV CLOSE').width + 8;
    c.fillStyle = 'rgba(8,13,25,0.85)';
    c.fillRect(4, y - 14, lw, 12);
    c.fillStyle = COL.prev;
    c.fillText('PREV CLOSE', 8, y - 7.5);
  }

  private news(d: ChartData, f: Frame, xOfT: (t: number) => number): void {
    const { c } = this;
    for (const n of d.news) {
      if (n.kind === 'gap') continue;
      const x = xOfT(n.t);
      if (x < 0 || x > f.plotW) continue;
      const y = f.priceH - 6;
      c.fillStyle = n.id === null ? '#9aa7bd' : n.sign > 0 ? COL.up : COL.down;
      c.beginPath();
      c.arc(x, y, 5, 0, TAU);
      c.fill();
      c.fillStyle = '#0b1120';
      c.font = `800 8px ${MONO}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(n.id === null ? 'M' : '!', x, y + 0.5);
    }
  }

  private fills(d: ChartData, yAt: (p: number) => number, xOfT: (t: number) => number): void {
    const { c } = this;
    for (const m of d.fills) {
      const x = xOfT(m.t);
      if (x < 0) continue;
      const y = yAt(m.price);
      c.fillStyle = m.side > 0 ? COL.up : COL.down;
      c.strokeStyle = '#0b1120';
      c.lineWidth = 1.5;
      c.beginPath();
      if (m.side > 0) {
        c.moveTo(x, y + 4);
        c.lineTo(x - 5, y + 12);
        c.lineTo(x + 5, y + 12);
      } else {
        c.moveTo(x, y - 4);
        c.lineTo(x - 5, y - 12);
        c.lineTo(x + 5, y - 12);
      }
      c.closePath();
      c.stroke();
      c.fill();
    }
  }

  /** Your position and its brackets. */
  private levels(d: ChartData, f: Frame, yAt: (p: number) => number): void {
    const { c } = this;
    const line = (p: number, col: string, dash: number[], label: string, left: boolean) => {
      if (p < this.lo || p > this.hi) return;
      const y = Math.round(yAt(p)) + 0.5;
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.setLineDash(dash);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(f.plotW, y);
      c.stroke();
      c.setLineDash([]);
      c.font = `700 9px ${MONO}`;
      const tw = c.measureText(label).width + 10;
      const x = left ? 4 : f.plotW - tw - 4;
      c.fillStyle = col;
      c.beginPath();
      c.roundRect(x, y - 8, tw, 16, 4);
      c.fill();
      c.fillStyle = COL.ink;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(label, x + 5, y + 0.5);
    };
    if (!d.pos) return;
    const p = d.pos;
    if (p.stop !== null) line(p.stop, COL.down, [3, 3], 'STOP', false);
    if (p.target !== null) line(p.target, COL.up, [3, 3], 'TARGET', false);
    const sign = d.pnl >= 0 ? '+' : '-';
    line(p.avg, d.pnl >= 0 ? COL.up : COL.down, [6, 3], `${p.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(p.qty).toLocaleString('en-US')}  ${sign}$${Math.abs(d.pnl).toFixed(2)}`, true);
  }

  private halted(d: ChartData, f: Frame, now: number): void {
    if (!d.halted) return;
    const { c } = this;
    c.save();
    c.beginPath();
    c.rect(0, f.top, f.plotW, f.plotH - f.top);
    c.clip();
    c.strokeStyle = 'rgba(255,210,63,0.12)';
    c.lineWidth = 10;
    const off = (now * 0.03) % 28;
    c.beginPath();
    for (let x = -f.plotH + off; x < f.plotW; x += 28) {
      c.moveTo(x, f.plotH);
      c.lineTo(x + f.plotH, f.top);
    }
    c.stroke();
    c.restore();
  }

  /** The last price: a line across and a tag on the axis that flashes when it ticks a cent. */
  private tag(f: Frame, yAt: (p: number) => number, price: number, up: boolean, now: number, fromX: number | null): void {
    const { c } = this;
    if (Math.round(price * 100) !== Math.round(this.lastPrice * 100)) this.flash = now;
    this.lastPrice = price;
    const y = Math.round(yAt(price)) + 0.5;
    const col = up ? COL.up : COL.down;
    c.strokeStyle = col;
    c.globalAlpha = 0.5;
    c.setLineDash([1, 3]);
    c.beginPath();
    c.moveTo(fromX ?? 0, y);
    c.lineTo(f.plotW, y);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
    const k = Math.max(0, 1 - (now - this.flash) / 300);
    c.fillStyle = col;
    c.beginPath();
    c.roundRect(f.plotW + 1, y - 9, f.axis - 2, 18, 4);
    c.fill();
    if (k > 0) {
      c.fillStyle = `rgba(255,255,255,${0.45 * k})`;
      c.fill();
    }
    c.fillStyle = COL.ink;
    c.font = `700 11px ${MONO}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(priceText(price), f.plotW + 5, y + 0.5);
  }
}
