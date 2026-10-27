// The candle chart: 5-minute candles for the stock you're watching, with
// VWAP, volume, yesterday's close, your position and its brackets, your
// fills and the news. Canvas 2D, redrawn every frame; the price range eases
// so the chart doesn't jitter, but always widens at once to fit a new high.
import { CANDLE } from './defs';
import type { Position } from './desk';
import type { News, Ticker } from './market';

export interface Mark {
  t: number;
  price: number;
  side: 1 | -1;
}

export interface ChartData {
  tk: Ticker;
  vwap: number;
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
  pos: '#60a5fa',
};
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Market minute to a clock: 0 is 9:30. */
export function clockAt(t: number, ampm = false): string {
  const m = 9 * 60 + 30 + Math.floor(t);
  const h = Math.floor(m / 60);
  const hh = ampm ? ((h + 11) % 12) + 1 : h;
  return `${hh}:${pad2(m % 60)}${ampm ? (h >= 12 ? ' PM' : ' AM') : ''}`;
}

export const priceText = (p: number) => (p >= 1000 ? p.toFixed(1) : p.toFixed(2));

export class CandleChart {
  private c: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private lo = 0;
  private hi = 0;
  private shown: string | null = null;
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
    const tk = d.tk;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const axis = w < 420 ? 50 : 58;
    const timeH = 16;
    const plotW = w - axis;
    const plotH = h - timeH;
    const volH = Math.round(plotH * 0.16);
    const priceH = plotH - volH - 4;
    const top = 6;
    const cw = Math.max(6, Math.min(14, plotW / 34));
    const slots = Math.max(8, Math.floor(plotW / cw) - 3);
    const all = tk.candles;
    const from = Math.max(0, all.length - slots);
    const vis = all.slice(from);
    const xAt = (i: number) => (i - from + 0.5) * cw;
    const xOfT = (t: number) => xAt(t / CANDLE - 0.5);

    // The price range: everything on screen, plus your levels.
    let tlo = Infinity;
    let thi = -Infinity;
    for (const k of vis) {
      tlo = Math.min(tlo, k.l, k.w);
      thi = Math.max(thi, k.h, k.w);
    }
    const levels = d.pos ? [d.pos.avg, d.pos.stop, d.pos.target].filter((x): x is number => x !== null) : [];
    for (const v of levels) {
      if (v > tlo * 0.9 && v < thi * 1.1) {
        tlo = Math.min(tlo, v);
        thi = Math.max(thi, v);
      }
    }
    const minRange = tk.price * 0.008;
    if (thi - tlo < minRange) {
      const mid = (thi + tlo) / 2;
      tlo = mid - minRange / 2;
      thi = mid + minRange / 2;
    }
    const padY = (thi - tlo) * 0.1;
    tlo -= padY;
    thi += padY;
    if (this.shown !== tk.def.id) {
      this.shown = tk.def.id;
      this.lo = tlo;
      this.hi = thi;
      this.lastPrice = tk.price;
    } else {
      this.lo = Math.min(tlo, this.lo + (tlo - this.lo) * 0.12);
      this.hi = Math.max(thi, this.hi + (thi - this.hi) * 0.12);
    }
    const { lo, hi } = this;
    const yAt = (p: number) => top + ((hi - p) / (hi - lo)) * (priceH - top);

    // Grid and price labels.
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
      c.moveTo(0, y);
      c.lineTo(plotW, y);
      c.fillText(priceText(p), plotW + 6, y);
    }
    // Time: every half hour.
    c.textAlign = 'center';
    for (let i = from; i < all.length; i++) {
      const t = all[i].t;
      if (Math.round(t) % 30 !== 0) continue;
      const x = Math.round(xAt(i)) + 0.5;
      c.moveTo(x, top);
      c.lineTo(x, plotH);
      c.fillText(clockAt(t), Math.max(16, Math.min(plotW - 16, x)), plotH + timeH / 2 + 1);
    }
    c.stroke();

    // Yesterday's close.
    if (tk.prev > lo && tk.prev < hi) {
      const y = Math.round(yAt(tk.prev)) + 0.5;
      c.strokeStyle = COL.prev;
      c.setLineDash([2, 4]);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(plotW, y);
      c.stroke();
      c.setLineDash([]);
      c.textAlign = 'left';
      c.font = `600 9px ${MONO}`;
      const lw = c.measureText('PREV CLOSE').width + 8;
      c.fillStyle = 'rgba(8,13,25,0.85)';
      c.fillRect(plotW - lw - 2, y - 14, lw, 12);
      c.fillStyle = COL.prev;
      c.fillText('PREV CLOSE', plotW - lw + 2, y - 7.5);
    }

    // Volume.
    const maxV = Math.max(1, ...vis.map((k) => k.v));
    for (let i = from; i < all.length; i++) {
      const k = all[i];
      const vh = (k.v / maxV) * volH;
      c.fillStyle = k.c >= k.o ? 'rgba(34,227,154,0.28)' : 'rgba(255,77,109,0.28)';
      c.fillRect(xAt(i) - cw * 0.32, plotH - vh, cw * 0.64, vh);
    }

    // VWAP.
    c.strokeStyle = COL.vwap;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.8;
    c.beginPath();
    vis.forEach((k, j) => (j ? c.lineTo(xAt(from + j), yAt(k.w)) : c.moveTo(xAt(from + j), yAt(k.w))));
    c.stroke();
    c.globalAlpha = 1;
    if (vis.length > 1) {
      c.fillStyle = COL.vwap;
      c.font = `600 9px ${MONO}`;
      c.textAlign = 'left';
      const k = vis[vis.length - 1];
      c.fillText('VWAP', Math.min(plotW - 30, xAt(all.length - 1) + 8), yAt(k.w) + (k.w > tk.price ? -8 : 8));
    }

    // Candles.
    for (let i = from; i < all.length; i++) {
      const k = all[i];
      const x = xAt(i);
      const up = k.c >= k.o;
      const col = up ? COL.up : COL.down;
      const live = i === all.length - 1;
      if (live) {
        c.fillStyle = up ? 'rgba(34,227,154,0.1)' : 'rgba(255,77,109,0.1)';
        c.fillRect(x - cw / 2, top, cw, plotH - top);
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
    }

    // News on the timeline.
    for (const n of d.news) {
      if (n.kind === 'gap') continue;
      const x = xOfT(n.t);
      if (x < 0 || x > plotW) continue;
      const y = priceH - 6;
      c.fillStyle = n.id === null ? '#9aa7bd' : n.sign > 0 ? COL.up : COL.down;
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0b1120';
      c.font = `800 8px ${MONO}`;
      c.textAlign = 'center';
      c.fillText(n.id === null ? 'M' : '!', x, y + 0.5);
    }

    // Your fills.
    for (const f of d.fills) {
      const x = xOfT(f.t);
      if (x < 0) continue;
      const y = yAt(f.price);
      c.fillStyle = f.side > 0 ? COL.up : COL.down;
      c.strokeStyle = '#0b1120';
      c.lineWidth = 1.5;
      c.beginPath();
      if (f.side > 0) {
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

    // Your position and its brackets.
    const line = (p: number, col: string, dash: number[], label: string, left: boolean) => {
      if (p < lo || p > hi) return;
      const y = Math.round(yAt(p)) + 0.5;
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.setLineDash(dash);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(plotW, y);
      c.stroke();
      c.setLineDash([]);
      c.font = `700 9px ${MONO}`;
      const tw = c.measureText(label).width + 10;
      const x = left ? 4 : plotW - tw - 4;
      c.fillStyle = col;
      c.beginPath();
      c.roundRect(x, y - 8, tw, 16, 4);
      c.fill();
      c.fillStyle = '#071019';
      c.textAlign = 'left';
      c.fillText(label, x + 5, y + 0.5);
    };
    if (d.pos) {
      const p = d.pos;
      if (p.stop !== null) line(p.stop, COL.down, [3, 3], 'STOP', false);
      if (p.target !== null) line(p.target, COL.up, [3, 3], 'TARGET', false);
      const sign = d.pnl >= 0 ? '+' : '-';
      line(p.avg, d.pnl >= 0 ? COL.up : COL.down, [6, 3], `${p.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(p.qty).toLocaleString('en-US')}  ${sign}$${Math.abs(d.pnl).toFixed(2)}`, true);
    }

    // Halted: stripes over everything.
    if (d.halted) {
      c.save();
      c.beginPath();
      c.rect(0, top, plotW, plotH - top);
      c.clip();
      c.strokeStyle = 'rgba(255,210,63,0.12)';
      c.lineWidth = 10;
      const off = (now * 0.03) % 28;
      c.beginPath();
      for (let x = -plotH + off; x < plotW; x += 28) {
        c.moveTo(x, plotH);
        c.lineTo(x + plotH, top);
      }
      c.stroke();
      c.restore();
    }

    // The last price, with a flash when it ticks.
    if (tk.price !== this.lastPrice) {
      this.flash = now;
      this.lastPrice = tk.price;
    }
    const up = tk.price >= (all[all.length - 1]?.o ?? tk.price);
    const y = Math.round(yAt(tk.price)) + 0.5;
    const col = up ? COL.up : COL.down;
    c.strokeStyle = col;
    c.globalAlpha = 0.5;
    c.setLineDash([1, 3]);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(plotW, y);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
    const k = Math.max(0, 1 - (now - this.flash) / 300);
    c.fillStyle = col;
    c.beginPath();
    c.roundRect(plotW + 1, y - 9, axis - 2, 18, 4);
    c.fill();
    if (k > 0) {
      c.fillStyle = `rgba(255,255,255,${0.45 * k})`;
      c.fill();
    }
    c.fillStyle = '#071019';
    c.font = `700 11px ${MONO}`;
    c.textAlign = 'left';
    c.fillText(priceText(tk.price), plotW + 5, y + 0.5);
  }
}
