// The sugar rush, on screen: a candy-colored monitor with the sugar line
// climbing across it, donuts, candy, soda cans and lollipops flying past
// faster the higher it goes, and our muffin kid riding the tip, vibrating
// harder, eyes spinning, sweating sprinkles. On a crash the line plunges, the
// kid flops over asleep and the color drains out for a beat. Everything is
// drawn here; the table decides what happens.
import { GROWTH, MILESTONE_NAMES } from './defs';
import { multiplierAt, timeFor } from './fair';
import type { Phase } from './game';

export interface SkyView {
  phase: Phase;
  /** Seconds into the phase. */
  t: number;
  m: number;
  crash: number;
  countdown: number;
  /** Your bet this round, if any. */
  you: { amount: number; cashedAt: number | null; payout: number } | null;
}

type Treat = 'donut' | 'candy' | 'soda' | 'lolly' | 'gummy';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  born: number;
  life: number;
  color: string;
  kind: 'sprinkle' | 'coin' | 'wrapper' | 'z' | 'spark';
  spin: number;
  gravity: number;
}

interface Flyer {
  kind: Treat;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  s: number;
  hue: number;
}

interface Pop {
  text: string;
  born: number;
  color: string;
}

/** A cash-out marked on the line. */
interface Pin {
  who: string;
  m: number;
  born: number;
  you: boolean;
}

const TAU = Math.PI * 2;
const ease = (k: number): number => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};
const CANDY = ['#ff5fa2', '#5ff2c4', '#ffe45c', '#9b7bff', '#5cc8ff', '#ff9b3d'];
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** A multiplier for show: 1.00, 12.34, 123.4, 1234. */
export function fmtX(m: number): string {
  if (m < 100) return (Math.floor(m * 100 + 1e-9) / 100).toFixed(2);
  if (m < 1000) return (Math.floor(m * 10 + 1e-9) / 10).toFixed(1);
  return Math.floor(m).toLocaleString('en-US');
}

/** Mint, then lemon, orange, bubblegum and grape as the rush builds. */
export function heat(m: number): string {
  const stops: [number, [number, number, number]][] = [
    [1, [95, 242, 196]],
    [2, [255, 228, 92]],
    [5, [255, 155, 61]],
    [10, [255, 95, 162]],
    [50, [155, 123, 255]],
  ];
  const lm = Math.log(Math.max(1, m));
  for (let i = 1; i < stops.length; i++) {
    const [a, ca] = stops[i - 1];
    const [b, cb] = stops[i];
    if (m <= b) {
      const k = (lm - Math.log(a)) / (Math.log(b) - Math.log(a));
      return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(',')})`;
    }
  }
  return 'rgb(155,123,255)';
}

/** The flavor readout in the corner: sugar, in made-up units, climbing with the rush. */
export const sugarLevel = (m: number): number => Math.round(90 + (m - 1) * 62);

const NICE = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000];
const NICE_T = [2, 5, 10, 15, 20, 30, 60, 120, 300, 600];
const TREATS: readonly Treat[] = ['donut', 'candy', 'soda', 'lolly', 'gummy'];

export class Sky {
  private c: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private last = 0;
  private sparkles: { x: number; y: number; r: number; tw: number; layer: number }[] = [];
  private flyers: Flyer[] = [];
  private parts: Particle[] = [];
  private pops: Pop[] = [];
  private pins: Pin[] = [];
  private xMax = 12;
  private yMax = 2;
  private shake = 0;
  private flash = 0;
  private flashColor = '255,95,162';
  private crashAt = -1e9;
  private launchAt = -1e9;
  private dir = 0;
  private nextSweat = 0;
  private nextFlyer = 0;
  private nextZ = 0;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private tip = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.c = canvas.getContext('2d')!;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) this.sparkles.push({ x: rnd(), y: rnd(), r: 0.8 + rnd() * 1.6, tw: rnd() * TAU, layer: i % 3 });
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(200, rect.width);
    this.H = Math.max(180, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  // -------------------------------------------------------------------------
  // What happened

  newRound(): void {
    this.pins = [];
    this.pops = [];
  }

  launch(): void {
    this.launchAt = this.last;
    this.burst(this.tip.x, this.tip.y, this.calm ? 6 : 22, 260);
  }

  milestone(m: number): void {
    this.pops.push({ text: MILESTONE_NAMES[m] ?? `${m}×`, born: this.last, color: heat(m) });
    this.flash = 0.25;
    this.flashColor = '255,228,92';
    this.burst(this.tip.x, this.tip.y, this.calm ? 8 : 30, 380);
  }

  cashout(who: string, m: number, you: boolean): void {
    this.pins.push({ who, m, born: this.last, you });
    if (this.pins.filter((p) => !p.you).length > 6) this.pins.splice(this.pins.findIndex((p) => !p.you), 1);
    if (!you) return;
    this.flash = 0.35;
    this.flashColor = '95,242,196';
    const n = this.calm ? 6 : 24;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 220 + Math.random() * 320;
      this.puff(this.tip.x, this.tip.y, Math.cos(a) * sp, Math.sin(a) * sp, 'coin', 1300 + Math.random() * 500, 4 + Math.random() * 3, '#ffc94a', 900);
    }
    for (let i = 0; i < (this.calm ? 4 : 14); i++) {
      const a = Math.random() * TAU;
      const sp = 120 + Math.random() * 200;
      this.puff(this.tip.x, this.tip.y, Math.cos(a) * sp, Math.sin(a) * sp - 120, 'wrapper', 1400 + Math.random() * 600, 4 + Math.random() * 3, pick(CANDY), 260);
    }
  }

  crash(): void {
    this.crashAt = this.last;
    this.shake = this.calm ? 0 : 0.7;
    this.flash = 0.5;
    this.flashColor = '255,77,97';
    this.burst(this.tip.x, this.tip.y, this.calm ? 6 : 26, 200);
  }

  /** Sprinkles everywhere. */
  private burst(x: number, y: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = speed * (0.3 + Math.random() * 0.7);
      this.puff(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60, 'sprinkle', 900 + Math.random() * 600, 2.5 + Math.random() * 1.5, pick(CANDY), 520);
    }
  }

  private puff(x: number, y: number, vx: number, vy: number, kind: Particle['kind'], life: number, r: number, color: string, gravity = 0): void {
    this.parts.push({ x, y, vx, vy, kind, life, r, color, born: this.last, spin: (Math.random() - 0.5) * 14, gravity });
    if (this.parts.length > 420) this.parts.splice(0, this.parts.length - 420);
  }

  // -------------------------------------------------------------------------
  // Drawing

  draw(now: number, v: SkyView): void {
    const dt = Math.min(0.05, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const c = this.c;
    const { W, H } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const flying = v.phase === 'flying';
    const crashed = v.phase === 'crashed';
    const tTip = flying ? v.t : crashed ? timeFor(v.crash) : 0;
    const mTip = v.phase === 'betting' ? 1 : v.m;

    // The axes stretch to keep the tip around three quarters of the way across and up.
    const wantX = v.phase === 'betting' ? 12 : Math.max(12, tTip / 0.76);
    const wantY = v.phase === 'betting' ? 2 : Math.max(2, 1 + (mTip - 1) / 0.68);
    const k = Math.min(1, dt * (v.phase === 'betting' ? 2.5 : 5));
    this.xMax = flying ? Math.max(this.xMax, this.xMax + (wantX - this.xMax) * k) : this.xMax + (wantX - this.xMax) * k;
    this.yMax = flying ? Math.max(this.yMax, this.yMax + (wantY - this.yMax) * k) : this.yMax + (wantY - this.yMax) * k;

    const gx0 = 48;
    const gx1 = W - 18;
    const gy0 = 30;
    const gy1 = H - 34;
    const X = (t: number) => gx0 + (t / this.xMax) * (gx1 - gx0);
    const Y = (m: number) => gy1 - ((m - 1) / (this.yMax - 1)) * (gy1 - gy0);

    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sk = this.shake * this.shake * 12;
    c.save();
    if (sk > 0.1) c.translate((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk);

    this.drawRoom(c, dt, now, v, mTip);
    this.drawGrid(c, gx0, gx1, gy0, gy1, X, Y);

    // The sugar line, and on a crash, the plunge.
    const plunge = crashed ? ease((now - this.crashAt) / 450) : 0;
    const tipX = X(tTip);
    const tipY = Y(mTip);
    if (v.phase !== 'betting') {
      const n = 70;
      const path = () => {
        c.beginPath();
        c.moveTo(X(0), Y(1));
        for (let i = 1; i <= n; i++) {
          const t = (tTip * i) / n;
          c.lineTo(X(t), Y(Math.min(mTip, multiplierAt(t))));
        }
      };
      path();
      c.save();
      c.lineTo(tipX, gy1);
      c.lineTo(X(0), gy1);
      c.closePath();
      const fill = c.createLinearGradient(0, tipY, 0, gy1);
      fill.addColorStop(0, crashed ? 'rgba(255,77,97,0.28)' : 'rgba(255,95,162,0.26)');
      fill.addColorStop(1, crashed ? 'rgba(255,77,97,0.02)' : 'rgba(95,242,196,0.03)');
      c.fillStyle = fill;
      c.fill();
      c.restore();
      path();
      if (crashed) {
        // Straight down.
        const dropX = tipX + (gx1 - tipX) * 0.04 * plunge;
        c.lineTo(dropX, tipY + (gy1 - tipY) * plunge);
      }
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.strokeStyle = crashed ? 'rgba(255,77,97,0.25)' : 'rgba(255,170,220,0.25)';
      c.lineWidth = 11;
      c.stroke();
      c.strokeStyle = crashed ? '#ff4d61' : heat(mTip);
      c.lineWidth = 3.5;
      c.stroke();
      if (flying) {
        // The live reading pulses at the tip, like a monitor.
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
        c.fillStyle = heat(mTip);
        c.globalAlpha = 0.35 + pulse * 0.4;
        c.beginPath();
        c.arc(tipX, tipY, 6 + pulse * 5, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
      }
    }

    this.drawPins(c, X, Y, now);

    // Our kid: bouncing on a donut before the rush, riding the line, or flat out asleep.
    const s = Math.max(15, Math.min(28, Math.min(W, H) * 0.055));
    if (flying) {
      const dx = (gx1 - gx0) / this.xMax;
      const dy = (GROWTH * mTip * (gy1 - gy0)) / (this.yMax - 1);
      this.dir += (Math.atan2(-dy, dx) - this.dir) * Math.min(1, dt * 10);
    }
    let kx: number;
    let ky: number;
    if (v.phase === 'betting') {
      kx = X(0) + s * 0.9;
      ky = Y(1) - s * 1.05 - Math.abs(Math.sin(now * 0.008)) * s * 0.35;
      drawDonut(c, X(0) + s * 0.9, Y(1) - s * 0.05, s * 0.9, 0, 0);
      drawKid(c, kx, ky, s, now, 1, 'pad', 0);
    } else if (flying) {
      kx = tipX;
      ky = tipY - s * 0.85;
      const shake = this.calm ? 0 : s * Math.min(0.16, 0.04 * Math.log2(mTip));
      kx += (Math.random() - 0.5) * shake * 2;
      ky += (Math.random() - 0.5) * shake * 2;
      drawKid(c, kx, ky, s, now, mTip, 'ride', this.dir * 0.25);
      // Sweating sprinkles, faster the higher it gets.
      if (!this.calm && now > this.nextSweat) {
        this.nextSweat = now + Math.max(30, 260 / Math.max(1, Math.log2(mTip) + 0.5));
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        this.puff(kx + Math.cos(a) * s * 0.6, ky - s * 0.5, Math.cos(a) * 90, Math.sin(a) * 120 - 40, 'sprinkle', 800 + Math.random() * 400, 2.5 + Math.random() * 1.2, pick(CANDY), 520);
      }
    } else {
      // Flop: down with the line, then over on its side, asleep.
      const fallX = tipX + (gx1 - tipX) * 0.04 * plunge;
      const fallY = tipY + (gy1 - tipY) * plunge;
      kx = fallX;
      ky = fallY - s * 0.55;
      const over = ease((now - this.crashAt - 350) / 350);
      drawKid(c, kx, ky, s, now, 1, 'asleep', (Math.PI / 2) * over);
      if (now - this.crashAt > 700 && now > this.nextZ) {
        this.nextZ = now + 650;
        this.puff(kx + s * 0.4, ky - s * 0.6, 16 + Math.random() * 10, -36, 'z', 1800, 9 + Math.random() * 5, '#d9d2ff', 0);
      }
    }
    this.tip = { x: kx, y: ky };

    this.drawParticles(c, dt, now);
    this.drawReadout(c, v, now);
    c.restore();

    // The crash drains the color out for a beat.
    const drain = crashed ? Math.max(0, 1 - Math.max(0, now - this.crashAt - 300) / 900) * Math.min(1, (now - this.crashAt) / 200) : 0;
    if (drain > 0.01) {
      c.save();
      c.globalCompositeOperation = 'saturation';
      c.fillStyle = `rgba(128,128,128,${drain * 0.85})`;
      c.fillRect(0, 0, W, H);
      c.restore();
      c.fillStyle = `rgba(10,6,20,${drain * 0.25})`;
      c.fillRect(0, 0, W, H);
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.flash > 0.01) {
      c.fillStyle = `rgba(${this.flashColor},${this.flash * 0.3})`;
      c.fillRect(0, 0, W, H);
    }
  }

  /** How much of the color is gone right now (0..1), for the page around the sky. */
  drained(now: number, phase: Phase): boolean {
    return phase === 'crashed' && now - this.crashAt < 1100;
  }

  private drawRoom(c: CanvasRenderingContext2D, dt: number, now: number, v: SkyView, m: number): void {
    const { W, H } = this;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0b2c');
    g.addColorStop(0.6, '#230f3a');
    g.addColorStop(1, '#2c1243');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // Candy-colored bokeh, drifting.
    const t = this.last * 0.00005;
    for (const [x, y, r, col] of [
      [0.2 + Math.sin(t) * 0.05, 0.25, 0.5, 'rgba(255,95,162,0.13)'],
      [0.85, 0.7 + Math.cos(t * 1.3) * 0.05, 0.45, 'rgba(95,242,196,0.08)'],
      [0.6 + Math.cos(t * 0.7) * 0.06, 0.15, 0.3, 'rgba(255,228,92,0.06)'],
    ] as const) {
      const ng = c.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.max(W, H));
      ng.addColorStop(0, col);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ng;
      c.fillRect(0, 0, W, H);
    }
    // Sparkles, and treats streaming past faster as the rush builds.
    const flying = v.phase === 'flying';
    const speed = flying ? 50 + Math.min(320, Math.log(m) * 110) : 10;
    const vx = flying ? -Math.cos(this.dir) * speed : -speed * 0.6;
    const vy = flying ? -Math.sin(this.dir) * speed : speed * 0.3;
    for (const sp of this.sparkles) {
      const f = [0.3, 0.6, 1][sp.layer];
      sp.x = (((sp.x + (vx * f * dt) / W) % 1) + 1) % 1;
      sp.y = (((sp.y + (vy * f * dt) / H) % 1) + 1) % 1;
      const a = 0.25 + 0.35 * Math.sin(this.last * 0.003 + sp.tw);
      if (a <= 0.02) continue;
      c.strokeStyle = `rgba(255,230,250,${a})`;
      c.lineWidth = 1;
      const x = sp.x * W;
      const y = sp.y * H;
      c.beginPath();
      c.moveTo(x - sp.r * 1.6, y);
      c.lineTo(x + sp.r * 1.6, y);
      c.moveTo(x, y - sp.r * 1.6);
      c.lineTo(x, y + sp.r * 1.6);
      c.stroke();
    }
    // Treats.
    const want = flying ? Math.min(14, 3 + Math.floor(Math.log2(m) * 3)) : 3;
    if (this.flyers.length < want && now > this.nextFlyer) {
      this.nextFlyer = now + (flying ? Math.max(120, 700 / Math.max(1, Math.log2(m) + 1)) : 1500);
      const s = Math.max(10, Math.min(24, Math.min(W, H) * 0.045)) * (0.7 + Math.random() * 0.7);
      // Come in from the side the treats are heading away from.
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      let x: number;
      let y: number;
      if (Math.abs(ux) > Math.abs(uy)) {
        x = ux < 0 ? W + s * 2 : -s * 2;
        y = Math.random() * H;
      } else {
        x = Math.random() * W;
        y = uy < 0 ? H + s * 2 : -s * 2;
      }
      this.flyers.push({ kind: pick(TREATS), x, y, vx: 0, vy: 0, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 2, s, hue: Math.floor(Math.random() * CANDY.length) });
    }
    this.flyers = this.flyers.filter((f) => {
      const depth = f.s / 24;
      f.x += vx * (0.6 + depth) * dt;
      f.y += vy * (0.6 + depth) * dt;
      f.rot += f.spin * dt * (flying ? 1 + Math.log2(m) * 0.4 : 0.4);
      c.globalAlpha = 0.55 + depth * 0.35;
      drawTreat(c, f.kind, f.x, f.y, f.s, f.rot, CANDY[f.hue]);
      c.globalAlpha = 1;
      return f.x > -f.s * 3 && f.x < W + f.s * 3 && f.y > -f.s * 3 && f.y < H + f.s * 3;
    });
    // The sugar readout, monitor style.
    const level = v.phase === 'betting' ? 90 : sugarLevel(v.phase === 'crashed' ? 1 : m);
    c.font = "700 11px 'IBM Plex Mono', monospace";
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    const blink = Math.sin(now * 0.008) > 0;
    c.fillStyle = v.phase === 'crashed' ? '#ff4d61' : '#5ff2c4';
    c.beginPath();
    c.arc(14, 15, 3.2, 0, TAU);
    if (blink || v.phase !== 'flying') c.fill();
    c.fillText(`SUGAR ${level} mg/dL ${v.phase === 'flying' ? '▲' : v.phase === 'crashed' ? '▼' : '–'}`, 22, 15.5);
  }

  private drawGrid(c: CanvasRenderingContext2D, gx0: number, gx1: number, gy0: number, gy1: number, X: (t: number) => number, Y: (m: number) => number): void {
    const span = this.yMax - 1;
    const step = NICE.find((n) => span / n <= 4.5) ?? NICE[NICE.length - 1];
    c.font = "600 11px 'IBM Plex Mono', monospace";
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.lineWidth = 1;
    for (let m = 1; m <= this.yMax + 1e-9; m += step) {
      const y = Y(m);
      if (y < gy0 - 4) break;
      c.strokeStyle = m === 1 ? 'rgba(255,170,220,0.35)' : 'rgba(255,170,220,0.11)';
      c.setLineDash(m === 1 ? [] : [3, 5]);
      c.beginPath();
      c.moveTo(gx0, y);
      c.lineTo(gx1, y);
      c.stroke();
      c.fillStyle = 'rgba(255,210,235,0.7)';
      c.fillText(`${+m.toFixed(2)}×`, gx0 - 6, y);
      if (step >= span) break;
    }
    c.setLineDash([]);
    const tStep = NICE_T.find((n) => this.xMax / n <= 5) ?? 600;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let t = tStep; t <= this.xMax; t += tStep) {
      const x = X(t);
      c.strokeStyle = 'rgba(255,170,220,0.07)';
      c.beginPath();
      c.moveTo(x, gy0);
      c.lineTo(x, gy1);
      c.stroke();
      c.fillStyle = 'rgba(255,210,235,0.55)';
      c.fillText(`${t}s`, x, gy1 + 8);
    }
  }

  private drawPins(c: CanvasRenderingContext2D, X: (t: number) => number, Y: (m: number) => number, now: number): void {
    let stack = 0;
    for (const p of this.pins) {
      const age = (now - p.born) / 1000;
      if (!p.you && age > 2.4) continue;
      const a = p.you ? 1 : Math.min(1, (2.4 - age) / 0.6);
      const x = X(timeFor(p.m));
      const y = Y(p.m);
      c.globalAlpha = a;
      c.fillStyle = p.you ? '#5ff2c4' : '#ffffff';
      c.beginPath();
      c.arc(x, y, p.you ? 5 : 3, 0, TAU);
      c.fill();
      const label = p.you ? `You ${fmtX(p.m)}×` : `${p.who} ${fmtX(p.m)}×`;
      c.font = p.you ? '800 12px Rubik, sans-serif' : '600 10.5px Rubik, sans-serif';
      const w = c.measureText(label).width + 12;
      const ly = y - 18 - (p.you ? 6 : (stack++ % 3) * 16) - Math.min(10, age * 8);
      const lx = Math.min(this.W - w - 6, Math.max(6, x - w / 2));
      c.fillStyle = p.you ? 'rgba(31,170,120,0.95)' : 'rgba(40,18,62,0.85)';
      c.beginPath();
      c.roundRect(lx, ly - 9, w, 18, 9);
      c.fill();
      c.fillStyle = p.you ? '#042117' : '#d6fff0';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, lx + w / 2, ly + 0.5);
      c.globalAlpha = 1;
    }
  }

  private drawParticles(c: CanvasRenderingContext2D, dt: number, now: number): void {
    this.parts = this.parts.filter((p) => {
      const age = (now - p.born) / p.life;
      if (age >= 1) return false;
      p.vy += p.gravity * dt;
      p.vx *= Math.exp(-dt * 0.6);
      p.vy *= Math.exp(-dt * (p.kind === 'z' ? 0 : 0.3));
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - age;
      c.globalAlpha = a;
      if (p.kind === 'sprinkle') {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.spin * age * 2);
        c.strokeStyle = p.color;
        c.lineWidth = p.r * 0.9;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-p.r, 0);
        c.lineTo(p.r, 0);
        c.stroke();
        c.restore();
      } else if (p.kind === 'coin') {
        const sq = Math.abs(Math.cos(now * 0.012 + p.spin));
        c.fillStyle = '#c98a12';
        c.beginPath();
        c.ellipse(p.x, p.y, p.r * Math.max(0.2, sq), p.r, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#ffe07a';
        c.beginPath();
        c.ellipse(p.x, p.y - 0.5, p.r * 0.75 * Math.max(0.2, sq), p.r * 0.75, 0, 0, TAU);
        c.fill();
      } else if (p.kind === 'wrapper') {
        // A candy wrapper, crinkling as it tumbles.
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.spin * age);
        c.scale(1, Math.abs(Math.cos(now * 0.01 + p.spin)) * 0.7 + 0.3);
        c.fillStyle = p.color;
        c.beginPath();
        c.moveTo(-p.r * 1.3, -p.r * 0.6);
        c.lineTo(-p.r * 0.4, 0);
        c.lineTo(-p.r * 1.3, p.r * 0.6);
        c.lineTo(p.r * 1.3, p.r * 0.6);
        c.lineTo(p.r * 0.4, 0);
        c.lineTo(p.r * 1.3, -p.r * 0.6);
        c.closePath();
        c.fill();
        c.restore();
      } else if (p.kind === 'z') {
        c.font = `900 italic ${Math.round(p.r * (1 + age * 0.6))}px Rubik, sans-serif`;
        c.fillStyle = p.color;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('z', p.x, p.y);
      } else {
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, TAU);
        c.fill();
      }
      return true;
    });
    c.globalAlpha = 1;
  }

  private drawReadout(c: CanvasRenderingContext2D, v: SkyView, now: number): void {
    const { W, H } = this;
    const cx = W / 2;
    const cy = H * 0.4;
    const big = Math.round(Math.min(W * 0.17, H * 0.24, 112));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const glowText = (text: string, y: number, size: number, color: string, weight = '900 italic') => {
      c.font = `${weight} ${size}px Rubik, sans-serif`;
      c.lineJoin = 'round';
      c.lineWidth = Math.max(4, size * 0.1);
      c.strokeStyle = 'rgba(20,6,30,0.7)';
      c.strokeText(text, cx, y);
      c.fillStyle = color;
      c.fillText(text, cx, y);
    };

    if (v.phase === 'betting') {
      c.font = '800 13px Rubik, sans-serif';
      c.fillStyle = 'rgba(255,210,235,0.85)';
      c.fillText('SUGAR RUSH IN', cx, cy - big * 0.42);
      glowText(`${v.countdown.toFixed(1)}s`, cy + 4, Math.round(big * 0.72), '#ffffff');
      const bw = Math.min(260, W * 0.6);
      const k = Math.max(0, Math.min(1, v.countdown / 6));
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.beginPath();
      c.roundRect(cx - bw / 2, cy + big * 0.48, bw, 6, 3);
      c.fill();
      const bar = c.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      bar.addColorStop(0, '#5ff2c4');
      bar.addColorStop(0.5, '#ffe45c');
      bar.addColorStop(1, '#ff5fa2');
      c.fillStyle = bar;
      c.beginPath();
      c.roundRect(cx - bw / 2, cy + big * 0.48, bw * k, 6, 3);
      c.fill();
      c.font = '600 12px Rubik, sans-serif';
      c.fillStyle = 'rgba(255,210,235,0.75)';
      c.fillText(v.you ? `You're in for ${v.you.amount.toLocaleString('en-US')}. Cash out before you crash.` : 'Place your bets. Cash out before you crash.', cx, cy + big * 0.48 + 22);
      return;
    }

    if (v.phase === 'crashed') {
      const since = (now - this.crashAt) / 1000;
      const drop = (1 - ease(since / 0.4)) * -big * 0.4;
      const wob = Math.sin(since * 9) * Math.max(0, 1 - since) * 0.06;
      c.save();
      c.translate(cx, cy + drop);
      c.rotate(wob);
      c.translate(-cx, -cy);
      glowText('SUGAR CRASH', cy - big * 0.3, Math.round(Math.min(big * 0.56, W * 0.12)), '#ff4d61');
      glowText(`@ ${fmtX(v.crash)}×`, cy + big * 0.36, Math.round(big * 0.48), '#ffd0d6');
      c.restore();
      c.font = "800 14px 'IBM Plex Mono', monospace";
      if (v.you && v.you.cashedAt === null) {
        c.fillStyle = '#ff4d61';
        c.fillText(`−${v.you.amount.toLocaleString('en-US')}`, cx, cy + big * 0.86);
      } else if (v.you) {
        c.fillStyle = '#5ff2c4';
        c.fillText(`You got out at ${fmtX(v.you.cashedAt!)}× · +${(v.you.payout - v.you.amount).toLocaleString('en-US')}`, cx, cy + big * 0.86);
      }
      return;
    }

    // The rush: the number, jittering more the higher it goes.
    const sinceLaunch = (now - this.launchAt) / 1000;
    const jit = this.calm ? 0 : Math.min(3, Math.log2(v.m) * 0.8);
    const size = Math.round(big * (sinceLaunch < 0.3 ? 0.8 + sinceLaunch * 0.66 : 1));
    c.save();
    c.translate((Math.random() - 0.5) * jit, (Math.random() - 0.5) * jit);
    glowText(`${fmtX(v.m)}×`, cy, size, heat(v.m));
    c.restore();
    if (v.you) {
      c.font = "800 14px 'IBM Plex Mono', monospace";
      if (v.you.cashedAt === null) {
        c.fillStyle = '#ffe45c';
        c.fillText(`Cash out ${Math.floor((v.you.amount * Math.floor(v.m * 100 + 1e-9)) / 100).toLocaleString('en-US')}`, cx, cy + big * 0.62);
      } else {
        c.fillStyle = '#5ff2c4';
        c.fillText(`Cashed out at ${fmtX(v.you.cashedAt)}× · +${(v.you.payout - v.you.amount).toLocaleString('en-US')}`, cx, cy + big * 0.62);
      }
    }
    // Milestone shouts.
    for (const p of this.pops) {
      const age = (now - p.born) / 1000;
      if (age > 1.6) continue;
      const k = ease(age / 0.25);
      c.globalAlpha = Math.min(1, (1.6 - age) / 0.5);
      const size = Math.round(Math.min(W * 0.075, 30) * (0.6 + k * 0.4));
      c.save();
      c.translate(cx, cy - big * 0.78 - age * 12);
      c.rotate(Math.sin(age * 14) * 0.05);
      c.font = `900 italic ${size}px Rubik, sans-serif`;
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(20,6,30,0.75)';
      c.strokeText(p.text, 0, 0);
      c.fillStyle = p.color;
      c.fillText(p.text, 0, 0);
      c.restore();
      c.globalAlpha = 1;
    }
  }
}

/** A donut: the launch pad. */
export function drawDonut(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, hue: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1, 0.42);
  c.fillStyle = '#d9954a';
  c.beginPath();
  c.arc(0, 0, s, 0, TAU);
  c.arc(0, 0, s * 0.38, 0, TAU, true);
  c.fill('evenodd');
  c.fillStyle = hue ? CANDY[hue % CANDY.length] : '#ff8cc2';
  c.beginPath();
  c.arc(0, -s * 0.12, s * 0.86, 0, TAU);
  c.arc(0, -s * 0.12, s * 0.42, 0, TAU, true);
  c.fill('evenodd');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const r = s * (0.55 + (i % 3) * 0.1);
    c.strokeStyle = CANDY[(i + 1) % CANDY.length];
    c.lineWidth = s * 0.08;
    c.beginPath();
    c.moveTo(Math.cos(a) * r, Math.sin(a) * r - s * 0.12);
    c.lineTo(Math.cos(a + 0.18) * r, Math.sin(a + 0.18) * r - s * 0.12);
    c.stroke();
  }
  c.restore();
}

/** One of the treats that fly past. */
function drawTreat(c: CanvasRenderingContext2D, kind: Treat, x: number, y: number, s: number, rot: number, color: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.lineJoin = 'round';
  switch (kind) {
    case 'donut': {
      c.fillStyle = '#d9954a';
      c.beginPath();
      c.arc(0, 0, s * 0.6, 0, TAU);
      c.arc(0, 0, s * 0.22, 0, TAU, true);
      c.fill('evenodd');
      c.fillStyle = color;
      c.beginPath();
      c.arc(0, 0, s * 0.52, 0, TAU);
      c.arc(0, 0, s * 0.26, 0, TAU, true);
      c.fill('evenodd');
      c.lineWidth = Math.max(1, s * 0.06);
      c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        c.strokeStyle = CANDY[(i + 2) % CANDY.length];
        c.beginPath();
        c.moveTo(Math.cos(a) * s * 0.38, Math.sin(a) * s * 0.38);
        c.lineTo(Math.cos(a + 0.25) * s * 0.4, Math.sin(a + 0.25) * s * 0.4);
        c.stroke();
      }
      break;
    }
    case 'candy': {
      c.fillStyle = color;
      c.beginPath();
      c.ellipse(0, 0, s * 0.38, s * 0.28, 0, 0, TAU);
      c.fill();
      for (const d of [-1, 1]) {
        c.beginPath();
        c.moveTo(d * s * 0.32, 0);
        c.lineTo(d * s * 0.7, -s * 0.24);
        c.lineTo(d * s * 0.62, 0);
        c.lineTo(d * s * 0.7, s * 0.24);
        c.closePath();
        c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.moveTo(-s * 0.15, -s * 0.22);
      c.lineTo(s * 0.05, s * 0.24);
      c.moveTo(s * 0.12, -s * 0.24);
      c.lineTo(s * 0.28, s * 0.14);
      c.stroke();
      break;
    }
    case 'soda': {
      const w = s * 0.5;
      const h = s * 0.9;
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(-w / 2, -h / 2, w, h, w * 0.18);
      c.fill();
      c.fillStyle = '#d7dde6';
      c.fillRect(-w / 2, -h / 2, w, h * 0.12);
      c.fillRect(-w / 2, h / 2 - h * 0.1, w, h * 0.1);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath();
      c.ellipse(0, 0, w * 0.32, h * 0.16, 0, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(-w * 0.32, -h * 0.32, w * 0.12, h * 0.6);
      break;
    }
    case 'lolly': {
      c.strokeStyle = '#f4f0ea';
      c.lineWidth = Math.max(1.5, s * 0.08);
      c.beginPath();
      c.moveTo(0, s * 0.1);
      c.lineTo(0, s * 0.85);
      c.stroke();
      c.fillStyle = color;
      c.beginPath();
      c.arc(0, -s * 0.15, s * 0.42, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = Math.max(1, s * 0.07);
      c.beginPath();
      for (let i = 0; i < 40; i++) {
        const a = i * 0.45;
        const r = (i / 40) * s * 0.38;
        const px = Math.cos(a) * r;
        const py = -s * 0.15 + Math.sin(a) * r;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
      break;
    }
    case 'gummy': {
      c.fillStyle = color;
      c.globalAlpha *= 0.9;
      c.beginPath();
      c.arc(0, -s * 0.28, s * 0.2, 0, TAU);
      c.arc(-s * 0.18, -s * 0.44, s * 0.09, 0, TAU);
      c.arc(s * 0.18, -s * 0.44, s * 0.09, 0, TAU);
      c.ellipse(0, s * 0.1, s * 0.27, s * 0.32, 0, 0, TAU);
      c.arc(-s * 0.26, -s * 0.02, s * 0.09, 0, TAU);
      c.arc(s * 0.26, -s * 0.02, s * 0.09, 0, TAU);
      c.arc(-s * 0.16, s * 0.42, s * 0.11, 0, TAU);
      c.arc(s * 0.16, s * 0.42, s * 0.11, 0, TAU);
      c.fill();
      break;
    }
  }
  c.restore();
}

/**
 * Our muffin kid: a striped liner with a face, a frosted top with sprinkles
 * and a cherry, and little arms. `m` drives how wired it is: wider eyes, then
 * spinning ones; a bigger grin, then the tongue; arms up. Asleep: eyes shut.
 */
export function drawKid(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, m: number, mode: 'pad' | 'ride' | 'asleep', tilt: number): void {
  const wired = Math.min(1, Math.log2(Math.max(1, m)) / Math.log2(10));
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.strokeStyle = '#2a0f2e';
  c.lineWidth = Math.max(1.4, s * 0.07);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // Arms: down on the pad and asleep, up and waving on the ride.
  const up = mode === 'ride' ? 0.4 + wired * 0.6 : 0;
  for (const side of [-1, 1]) {
    const wave = mode === 'ride' ? Math.sin(t * (0.01 + wired * 0.03) + side) * 0.35 : 0;
    const a = side * (Math.PI / 2 + 0.5 - up * 1.4 + wave);
    c.beginPath();
    c.moveTo(side * s * 0.5, s * 0.15);
    c.lineTo(side * s * 0.5 + Math.sin(a) * s * 0.55 * side, s * 0.15 - Math.cos(a) * s * 0.55);
    c.stroke();
  }
  // The liner, striped.
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(-s * 0.62, -s * 0.05);
  c.lineTo(s * 0.62, -s * 0.05);
  c.lineTo(s * 0.46, s * 0.72);
  c.lineTo(-s * 0.46, s * 0.72);
  c.closePath();
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = '#ff8cc2';
  for (let i = -4; i <= 4; i += 2) {
    c.beginPath();
    c.moveTo(i * s * 0.14 - s * 0.07, -s * 0.05);
    c.lineTo(i * s * 0.14 + s * 0.07, -s * 0.05);
    c.lineTo(i * s * 0.1 + s * 0.05, s * 0.72);
    c.lineTo(i * s * 0.1 - s * 0.05, s * 0.72);
    c.closePath();
    c.fill();
  }
  c.restore();
  c.stroke();
  // The top: frosting over a muffin dome, with sprinkles and a cherry.
  c.fillStyle = '#c9803d';
  c.beginPath();
  c.ellipse(0, -s * 0.12, s * 0.72, s * 0.5, 0, Math.PI, TAU);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#ffd3ec';
  c.beginPath();
  c.moveTo(-s * 0.66, -s * 0.16);
  for (let i = 0; i <= 6; i++) {
    const px = -s * 0.66 + (i / 6) * s * 1.32;
    c.quadraticCurveTo(px - s * 0.11, -s * (0.05 + (i % 2) * 0.08), px, -s * 0.16);
  }
  c.ellipse(0, -s * 0.16, s * 0.66, s * 0.44, 0, 0, Math.PI, true);
  c.closePath();
  c.fill();
  c.stroke();
  c.lineWidth = Math.max(1.2, s * 0.06);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + 0.35 + (i / 7) * (Math.PI - 0.7);
    const r = s * (0.22 + (i % 3) * 0.1);
    c.strokeStyle = CANDY[i % CANDY.length];
    c.beginPath();
    c.moveTo(Math.cos(a) * r, -s * 0.2 + Math.sin(a) * r * 0.75);
    c.lineTo(Math.cos(a + 0.2) * r, -s * 0.2 + Math.sin(a + 0.2) * r * 0.75);
    c.stroke();
  }
  c.strokeStyle = '#2a0f2e';
  c.lineWidth = Math.max(1.2, s * 0.05);
  c.beginPath();
  c.moveTo(0, -s * 0.62);
  c.quadraticCurveTo(s * 0.08, -s * 0.8, s * 0.18, -s * 0.84);
  c.stroke();
  c.fillStyle = '#ff3355';
  c.beginPath();
  c.arc(0, -s * 0.6, s * 0.12, 0, TAU);
  c.fill();
  c.stroke();
  // The face, on the liner.
  const ey = s * 0.2;
  const ex = s * 0.2;
  c.fillStyle = '#2a0f2e';
  if (mode === 'asleep') {
    c.lineWidth = Math.max(1.4, s * 0.06);
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(side * ex, ey, s * 0.09, 0.2, Math.PI - 0.2);
      c.stroke();
    }
    c.beginPath();
    c.arc(0, s * 0.46, s * 0.06, 0, TAU);
    c.stroke();
  } else {
    const r = s * (0.1 + wired * 0.06);
    for (const side of [-1, 1]) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(side * ex, ey, r, 0, TAU);
      c.fill();
      c.stroke();
      if (m >= 5) {
        // Spinning spiral eyes.
        c.strokeStyle = '#2a0f2e';
        c.lineWidth = Math.max(1, s * 0.035);
        c.beginPath();
        const spin = t * (0.008 + wired * 0.02) * side;
        for (let i = 0; i < 22; i++) {
          const a = spin + i * 0.55;
          const rr = (i / 22) * r * 0.9;
          const px = side * ex + Math.cos(a) * rr;
          const py = ey + Math.sin(a) * rr;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
        c.lineWidth = Math.max(1.4, s * 0.07);
      } else {
        c.fillStyle = '#2a0f2e';
        c.beginPath();
        c.arc(side * ex + s * 0.02, ey + s * 0.01, r * (0.5 - wired * 0.15), 0, TAU);
        c.fill();
      }
    }
    // The grin, bigger as it gets wired; the tongue past 10×.
    const gw = s * (0.16 + wired * 0.12);
    c.fillStyle = '#6a1638';
    c.beginPath();
    c.moveTo(-gw, s * 0.4);
    c.quadraticCurveTo(0, s * (0.48 + wired * 0.18), gw, s * 0.4);
    c.closePath();
    c.fill();
    c.stroke();
    if (m >= 10) {
      c.fillStyle = '#ff6b9e';
      c.beginPath();
      c.ellipse(s * 0.04, s * (0.52 + wired * 0.08), s * 0.07, s * 0.09, 0.2, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}
