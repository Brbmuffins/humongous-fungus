// Live price chart for one market good: a 2px line with a faint area wash,
// hairline gridlines, the latest price marked, an optional "your price" line,
// and a crosshair readout on hover, touch or arrow keys.
import { MARKET_TICK_MS } from '../game/defs';
import { fmt, fmtDuration } from '../game/format';

const css = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export class PriceChart {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private tip: HTMLElement;
  private tipValue: HTMLElement;
  private tipAge: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private history: number[] = [];
  private scale = 1;
  private paid: number | null = null;
  private hover: number | null = null;
  private label = '';
  private colors = {
    line: css('--amber', '#eab460'),
    grid: css('--bark', '#45372a'),
    text: css('--bone', '#efe6d6'),
    muted: css('--lichen', '#a9ae98'),
    surface: css('--soil', '#16110d'),
  };

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'chart-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    this.tipValue = document.createElement('strong');
    this.tipAge = document.createElement('span');
    this.tip = document.createElement('div');
    this.tip.className = 'chart-tip';
    this.tip.hidden = true;
    this.tip.append(this.tipValue, this.tipAge);
    this.el = document.createElement('div');
    this.el.className = 'chart';
    this.el.append(this.canvas, this.tip);
    this.ctx = this.canvas.getContext('2d')!;

    const pick = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const { x0, x1 } = this.plot(rect.width, rect.height);
      const n = this.history.length;
      if (n < 2) return;
      const f = (e.clientX - rect.left - x0) / (x1 - x0);
      this.setHover(Math.round(Math.min(1, Math.max(0, f)) * (n - 1)));
    };
    this.canvas.addEventListener('pointermove', pick);
    this.canvas.addEventListener('pointerdown', pick);
    this.canvas.addEventListener('pointerleave', () => this.setHover(null));
    this.canvas.addEventListener('blur', () => this.setHover(null));
    this.canvas.addEventListener('keydown', (e) => {
      const n = this.history.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.key === 'ArrowLeft' ? -1 : 1;
        this.setHover(Math.min(n - 1, Math.max(0, (this.hover ?? n - 1) + step)));
      } else if (e.key === 'Escape') this.setHover(null);
    });
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  /** `scale` converts price points to nutrients; `paid` is the average index you paid. */
  setData(history: number[], scale: number, paid: number | null, label: string): void {
    this.history = history;
    this.scale = scale;
    this.paid = paid;
    this.label = label;
    if (this.hover !== null) this.hover = Math.min(this.hover, history.length - 1);
    this.draw();
  }

  private setHover(i: number | null): void {
    if (i === this.hover) return;
    this.hover = i;
    this.draw();
  }

  private plot(W: number, H: number) {
    return { x0: 4, x1: W - 70, y0: 14, y1: H - 22 };
  }

  draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W < 10 || H < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(W * dpr)) this.canvas.width = Math.round(W * dpr);
    if (this.canvas.height !== Math.round(H * dpr)) this.canvas.height = Math.round(H * dpr);
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const h = this.history;
    if (h.length < 2) return;

    const { x0, x1, y0, y1 } = this.plot(W, H);
    let lo = Math.min(...h);
    let hi = Math.max(...h);
    if (this.paid !== null) {
      lo = Math.min(lo, this.paid);
      hi = Math.max(hi, this.paid);
    }
    const pad = (hi - lo) * 0.08 || hi * 0.05;
    lo -= pad;
    hi += pad;
    const X = (i: number) => x0 + (i / (h.length - 1)) * (x1 - x0);
    const Y = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
    const { line, grid, text, muted, surface } = this.colors;

    const last = h[h.length - 1];
    const ex = X(h.length - 1);
    const ey = Y(last);

    // Hairline grid at the high, middle and low, valued in the right gutter
    // (skipping any label the latest price would sit on).
    c.font = '500 11px Rubik, system-ui, sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    for (const v of [hi - pad, (hi + lo) / 2, lo + pad]) {
      const y = Math.round(Y(v)) + 0.5;
      c.strokeStyle = grid;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.stroke();
      if (Math.abs(y - ey) < 16) continue;
      c.fillStyle = muted;
      c.fillText(fmt(v * this.scale), x1 + 10, y);
    }

    // Area wash, then the line.
    c.beginPath();
    h.forEach((v, i) => (i === 0 ? c.moveTo(X(i), Y(v)) : c.lineTo(X(i), Y(v))));
    c.lineTo(X(h.length - 1), y1);
    c.lineTo(X(0), y1);
    c.closePath();
    c.globalAlpha = 0.1;
    c.fillStyle = line;
    c.fill();
    c.globalAlpha = 1;
    c.beginPath();
    h.forEach((v, i) => (i === 0 ? c.moveTo(X(i), Y(v)) : c.lineTo(X(i), Y(v))));
    c.strokeStyle = line;
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.stroke();

    // What you paid, if holding.
    if (this.paid !== null) {
      const y = Math.round(Y(this.paid)) + 0.5;
      c.strokeStyle = text;
      c.globalAlpha = 0.55;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.stroke();
      c.globalAlpha = 1;
      // Label above the line, or below it when the line is near the top.
      const above = y - y0 > 16;
      c.font = '500 11px Rubik, system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = above ? 'bottom' : 'top';
      const tw = c.measureText('you paid').width;
      c.fillStyle = surface;
      c.fillRect(x0 + 2, above ? y - 16 : y + 2, tw + 8, 14);
      c.fillStyle = text;
      c.fillText('you paid', x0 + 6, above ? y - 3 : y + 3);
    }

    // Latest price: ringed dot and a label in the right gutter.
    c.fillStyle = surface;
    c.beginPath();
    c.arc(ex, ey, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = line;
    c.beginPath();
    c.arc(ex, ey, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = text;
    c.font = '600 13px Rubik, system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(fmt(last * this.scale), x1 + 10, Math.min(y1, Math.max(y0, ey)));

    // Time axis.
    c.font = '500 11px Rubik, system-ui, sans-serif';
    c.fillStyle = muted;
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillText(`${fmtDuration(((h.length - 1) * MARKET_TICK_MS) / 1000)} ago`, x0, y1 + 6);
    c.textAlign = 'right';
    c.fillText('now', x1, y1 + 6);

    // Crosshair readout.
    if (this.hover !== null) {
      const i = this.hover;
      const x = Math.round(X(i)) + 0.5;
      c.strokeStyle = text;
      c.globalAlpha = 0.4;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, y0 - 6);
      c.lineTo(x, y1);
      c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = surface;
      c.beginPath();
      c.arc(x, Y(h[i]), 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = line;
      c.beginPath();
      c.arc(x, Y(h[i]), 4, 0, Math.PI * 2);
      c.fill();
      const age = ((h.length - 1 - i) * MARKET_TICK_MS) / 1000;
      this.tipValue.textContent = fmt(h[i] * this.scale);
      this.tipAge.textContent = age < 1 ? 'now' : `${fmtDuration(age)} ago`;
      this.tip.hidden = false;
      // Sit above the hovered point, inside the chart, clear of the finger.
      const tw = this.tip.offsetWidth;
      const th = this.tip.offsetHeight;
      const left = Math.min(W - tw - 4, Math.max(4, x - tw / 2));
      const py = Y(h[i]);
      const top = py - th - 12 >= 0 ? py - th - 12 : Math.min(H - th, py + 12);
      this.tip.style.left = `${left}px`;
      this.tip.style.top = `${top}px`;
    } else {
      this.tip.hidden = true;
    }

    const min = Math.min(...h) * this.scale;
    const max = Math.max(...h) * this.scale;
    this.canvas.setAttribute(
      'aria-label',
      `${this.label} price over the last ${fmtDuration(((h.length - 1) * MARKET_TICK_MS) / 1000)}: low ${fmt(min)}, high ${fmt(max)}, now ${fmt(last * this.scale)}. Use the arrow keys to read earlier prices.`,
    );
  }
}
