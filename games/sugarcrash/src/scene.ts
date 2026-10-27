// The rush, on screen: a monitor with the multiplier line climbing across it,
// axes that stretch to keep the tip in view, the character riding the tip and
// the crash plunge. This is the part every theme shares. What's behind the
// line, the character and its crash, the colors, shouts and gauge come from
// the active theme (src/themes); the table decides what happens.
import { GROWTH } from './defs';
import { multiplierAt, timeFor } from './fair';
import type { Phase } from './game';
import { TAU, clamp, ease, fitText, pick, type Frame, type PKind, type Puff, type RiderFrame, type Theme, type ThemeScene } from './themes/kit';

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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  born: number;
  life: number;
  color: string;
  kind: PKind;
  spin: number;
  gravity: number;
  text: string;
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

/** A multiplier for show: 1.00, 12.34, 123.4, 1234. */
export function fmtX(m: number): string {
  if (m < 100) return (Math.floor(m * 100 + 1e-9) / 100).toFixed(2);
  if (m < 1000) return (Math.floor(m * 10 + 1e-9) / 10).toFixed(1);
  return Math.floor(m).toLocaleString('en-US');
}

/** Small text with a dark edge, so it reads over a bright backdrop too. */
function edged(c: CanvasRenderingContext2D, text: string, x: number, y: number, edge: string | null): void {
  if (edge) {
    c.save();
    c.lineJoin = 'round';
    c.lineWidth = 2.5;
    c.strokeStyle = edge;
    c.strokeText(text, x, y);
    c.restore();
  }
  c.fillText(text, x, y);
}

const NICE = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000];
const NICE_T = [2, 5, 10, 15, 20, 30, 60, 120, 300, 600];

export class Sky {
  private c: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private last = 0;
  private scene: ThemeScene;
  private parts: Particle[] = [];
  private pops: Pop[] = [];
  private pins: Pin[] = [];
  private xMax = 12;
  private yMax = 2;
  private shake = 0;
  private flash = 0;
  private flashColor: string;
  private crashAt = -1e9;
  private crashVariant = 0;
  private launchAt = -1e9;
  private dir = 0;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private tip = { x: 0, y: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private theme: Theme,
  ) {
    this.c = canvas.getContext('2d')!;
    this.scene = theme.scene();
    this.flashColor = theme.ink.flashMilestone;
    this.resize();
  }

  /** Switch the look: a fresh backdrop and character, and no leftover bursts. */
  setTheme(theme: Theme): void {
    this.theme = theme;
    this.scene = theme.scene();
    this.parts = [];
    this.pops = [];
    this.flash = 0;
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
    this.pops.push({ text: this.theme.milestones[m] ?? `${m}×`, born: this.last, color: this.theme.heat(m) });
    this.flash = 0.25;
    this.flashColor = this.theme.ink.flashMilestone;
    this.burst(this.tip.x, this.tip.y, this.calm ? 8 : 30, 380);
  }

  cashout(who: string, m: number, you: boolean): void {
    this.pins.push({ who, m, born: this.last, you });
    if (this.pins.filter((p) => !p.you).length > 6) this.pins.splice(this.pins.findIndex((p) => !p.you), 1);
    if (!you) return;
    this.flash = 0.35;
    this.flashColor = this.theme.ink.flashCash;
    const n = this.calm ? 6 : 24;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 220 + Math.random() * 320;
      this.puff(this.tip.x, this.tip.y, Math.cos(a) * sp, Math.sin(a) * sp, 'coin', 1300 + Math.random() * 500, 4 + Math.random() * 3, '#ffc94a', 900);
    }
    for (let i = 0; i < (this.calm ? 4 : 14); i++) {
      const a = Math.random() * TAU;
      const sp = 120 + Math.random() * 200;
      this.puff(this.tip.x, this.tip.y, Math.cos(a) * sp, Math.sin(a) * sp - 120, 'flutter', 1400 + Math.random() * 600, 4 + Math.random() * 3, pick(this.theme.fx.confetti), 260);
    }
  }

  /** The round crashed. `variant` picks which of the theme's crashes plays. */
  crash(variant = 0): void {
    this.crashVariant = variant;
    this.crashAt = this.last;
    this.shake = this.calm ? 0 : 0.7;
    this.flash = 0.5;
    this.flashColor = this.theme.ink.flashCrash;
    this.burst(this.tip.x, this.tip.y, this.calm ? 6 : 26, 200);
  }

  /** The theme's burst of confetti, sparks or whatever it throws. */
  private burst(x: number, y: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = speed * (0.3 + Math.random() * 0.7);
      this.puff(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60, this.theme.fx.burst, 900 + Math.random() * 600, 2.5 + Math.random() * 1.5, pick(this.theme.fx.confetti), 520);
    }
  }

  private puff: Puff = (x, y, vx, vy, kind, life, r, color, gravity = 0, text = '') => {
    this.parts.push({ x, y, vx, vy, kind, life, r, color, born: this.last, spin: (Math.random() - 0.5) * 14, gravity, text });
    if (this.parts.length > 420) this.parts.splice(0, this.parts.length - 420);
  };

  // -------------------------------------------------------------------------
  // Drawing

  draw(now: number, v: SkyView): void {
    const dt = Math.min(0.05, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const c = this.c;
    const { W, H, theme } = this;
    const ink = theme.ink;
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

    // Which way the line is heading, smoothed: the scenery slides against it.
    if (flying) {
      const dx = (gx1 - gx0) / this.xMax;
      const dy = (GROWTH * mTip * (gy1 - gy0)) / (this.yMax - 1);
      this.dir += (Math.atan2(-dy, dx) - this.dir) * Math.min(1, dt * 10);
    }
    const frame: Frame = { c, W, H, now, dt, phase: v.phase, m: mTip, dir: this.dir, calm: this.calm, puff: this.puff };

    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sk = this.shake * this.shake * 12;
    c.save();
    if (sk > 0.1) c.translate((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk);

    this.scene.backdrop(frame);
    this.drawGauge(c, v, now, mTip);
    this.drawGrid(c, gx0, gx1, gy0, gy1, X, Y);

    // The line, and on a crash, the plunge.
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
      fill.addColorStop(0, crashed ? ink.crashFillTop : ink.fillTop);
      fill.addColorStop(1, crashed ? ink.crashFillBottom : ink.fillBottom);
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
      c.strokeStyle = crashed ? 'rgba(255,77,97,0.25)' : ink.glow;
      c.lineWidth = 11;
      c.stroke();
      c.strokeStyle = crashed ? ink.lose : theme.heat(mTip);
      c.lineWidth = 3.5;
      c.stroke();
      if (flying) {
        // The live reading pulses at the tip, like a monitor.
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
        c.fillStyle = theme.heat(mTip);
        c.globalAlpha = 0.35 + pulse * 0.4;
        c.beginPath();
        c.arc(tipX, tipY, 6 + pulse * 5, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
      }
    }

    this.drawPins(c, X, Y, now);

    // The character: waiting on the pad before the rush, riding the line, or the crash.
    const s = Math.max(15, Math.min(28, Math.min(W, H) * 0.055));
    const rf: RiderFrame = {
      ...frame,
      tipX,
      tipY,
      padX: X(0),
      padY: Y(1),
      floorY: gy1,
      rightX: gx1,
      s,
      variant: this.crashVariant % theme.crashes.length,
      since: crashed ? Math.max(0, (now - this.crashAt) / 1000) : 0,
      plunge,
    };
    this.tip = this.scene.rider(rf);

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
      c.fillStyle = `rgba(${ink.drain},${drain * 0.25})`;
      c.fillRect(0, 0, W, H);
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.flash > 0.01) {
      c.fillStyle = `rgba(${this.flashColor},${this.flash * 0.3})`;
      c.fillRect(0, 0, W, H);
    }
  }

  /** Is the color draining out of the picture right now (the page around it follows)? */
  drained(now: number, phase: Phase): boolean {
    return phase === 'crashed' && now - this.crashAt < 1100;
  }

  /** The made-up gauge in the corner, monitor style. */
  private drawGauge(c: CanvasRenderingContext2D, v: SkyView, now: number, m: number): void {
    const ink = this.theme.ink;
    const level = this.theme.readout.level(v.phase === 'flying' ? m : 1);
    c.font = "700 11px 'IBM Plex Mono', monospace";
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    const blink = Math.sin(now * 0.008) > 0;
    c.fillStyle = v.phase === 'crashed' ? ink.lose : ink.win;
    c.beginPath();
    c.arc(14, 15, 3.2, 0, TAU);
    if (blink || v.phase !== 'flying') c.fill();
    edged(c, `${this.theme.readout.text(level)} ${v.phase === 'flying' ? '▲' : v.phase === 'crashed' ? '▼' : '–'}`, 22, 15.5, ink.edge ? ink.outline : null);
  }

  private drawGrid(c: CanvasRenderingContext2D, gx0: number, gx1: number, gy0: number, gy1: number, X: (t: number) => number, Y: (m: number) => number): void {
    const { grid, label } = this.theme.ink;
    const span = this.yMax - 1;
    const step = NICE.find((n) => span / n <= 4.5) ?? NICE[NICE.length - 1];
    c.font = "600 11px 'IBM Plex Mono', monospace";
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.lineWidth = 1;
    for (let m = 1; m <= this.yMax + 1e-9; m += step) {
      const y = Y(m);
      if (y < gy0 - 4) break;
      c.strokeStyle = m === 1 ? `rgba(${grid},0.35)` : `rgba(${grid},0.11)`;
      c.setLineDash(m === 1 ? [] : [3, 5]);
      c.beginPath();
      c.moveTo(gx0, y);
      c.lineTo(gx1, y);
      c.stroke();
      c.fillStyle = `rgba(${label},0.7)`;
      edged(c, `${+m.toFixed(2)}×`, gx0 - 6, y, this.theme.ink.edge ? this.theme.ink.outline : null);
      if (step >= span) break;
    }
    c.setLineDash([]);
    const tStep = NICE_T.find((n) => this.xMax / n <= 5) ?? 600;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let t = tStep; t <= this.xMax; t += tStep) {
      const x = X(t);
      c.strokeStyle = `rgba(${grid},0.07)`;
      c.beginPath();
      c.moveTo(x, gy0);
      c.lineTo(x, gy1);
      c.stroke();
      c.fillStyle = `rgba(${label},0.55)`;
      edged(c, `${t}s`, x, gy1 + 8, this.theme.ink.edge ? this.theme.ink.outline : null);
    }
  }

  private drawPins(c: CanvasRenderingContext2D, X: (t: number) => number, Y: (m: number) => number, now: number): void {
    const ink = this.theme.ink;
    let stack = 0;
    for (const p of this.pins) {
      const age = (now - p.born) / 1000;
      if (!p.you && age > 2.4) continue;
      const a = p.you ? 1 : Math.min(1, (2.4 - age) / 0.6);
      const x = X(timeFor(p.m));
      const y = Y(p.m);
      c.globalAlpha = a;
      c.fillStyle = p.you ? ink.pinYou : '#ffffff';
      c.beginPath();
      c.arc(x, y, p.you ? 5 : 3, 0, TAU);
      c.fill();
      const label = p.you ? `You ${fmtX(p.m)}×` : `${p.who} ${fmtX(p.m)}×`;
      c.font = p.you ? '800 12px Rubik, sans-serif' : '600 10.5px Rubik, sans-serif';
      const w = c.measureText(label).width + 12;
      const ly = y - 18 - (p.you ? 6 : (stack++ % 3) * 16) - Math.min(10, age * 8);
      const lx = Math.min(this.W - w - 6, Math.max(6, x - w / 2));
      c.fillStyle = p.you ? ink.pinYouBg : ink.pinBotBg;
      c.beginPath();
      c.roundRect(lx, ly - 9, w, 18, 9);
      c.fill();
      c.fillStyle = p.you ? ink.pinYouText : ink.pinBotText;
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
      p.vy *= Math.exp(-dt * (p.kind === 'text' ? 0 : 0.3));
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - age;
      c.globalAlpha = a;
      if (p.kind === 'stick') {
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
      } else if (p.kind === 'flutter') {
        // A scrap of wrapper, ticket or paper, crinkling as it tumbles.
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
      } else if (p.kind === 'text') {
        c.font = `900 italic ${Math.round(p.r * (1 + age * 0.6))}px Rubik, sans-serif`;
        c.fillStyle = p.color;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(p.text, p.x, p.y);
      } else if (p.kind === 'drop') {
        // A teardrop, pointing the way it's moving.
        c.save();
        c.translate(p.x, p.y);
        c.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2);
        c.fillStyle = p.color;
        c.beginPath();
        c.moveTo(0, -p.r * 1.6);
        c.quadraticCurveTo(p.r * 1.1, -p.r * 0.1, 0, p.r);
        c.quadraticCurveTo(-p.r * 1.1, -p.r * 0.1, 0, -p.r * 1.6);
        c.fill();
        c.restore();
      } else if (p.kind === 'flame') {
        const r = p.r * (1.3 - age * 0.5);
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, p.color);
        g.addColorStop(1, 'rgba(255,60,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y, r, 0, TAU);
        c.fill();
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
    const { W, H, theme } = this;
    const ink = theme.ink;
    const cx = W / 2;
    const cy = H * 0.4;
    const big = Math.round(Math.min(W * 0.17, H * 0.24, 112));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const glowText = (text: string, y: number, size: number, color: string, weight = '900 italic') => {
      const px = fitText(c, text, (p) => `${weight} ${p}px Rubik, sans-serif`, size, W * 0.94);
      c.lineJoin = 'round';
      c.lineWidth = Math.max(4, px * 0.1);
      c.strokeStyle = ink.outline;
      c.strokeText(text, cx, y);
      c.fillStyle = color;
      c.fillText(text, cx, y);
    };

    if (v.phase === 'betting') {
      c.font = '800 13px Rubik, sans-serif';
      c.fillStyle = ink.caption;
      edged(c, theme.launchLabel, cx, cy - big * 0.42, ink.edge ? ink.outline : null);
      glowText(`${v.countdown.toFixed(1)}s`, cy + 4, Math.round(big * 0.72), '#ffffff');
      const bw = Math.min(260, W * 0.6);
      const k = Math.max(0, Math.min(1, v.countdown / 6));
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.beginPath();
      c.roundRect(cx - bw / 2, cy + big * 0.48, bw, 6, 3);
      c.fill();
      const bar = c.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      bar.addColorStop(0, ink.bar[0]);
      bar.addColorStop(0.5, ink.bar[1]);
      bar.addColorStop(1, ink.bar[2]);
      c.fillStyle = bar;
      c.beginPath();
      c.roundRect(cx - bw / 2, cy + big * 0.48, bw * k, 6, 3);
      c.fill();
      c.font = '600 12px Rubik, sans-serif';
      c.fillStyle = ink.caption;
      edged(c, v.you ? `You're in for ${v.you.amount.toLocaleString('en-US')}. Cash out before you crash.` : 'Place your bets. Cash out before you crash.', cx, cy + big * 0.48 + 22, ink.edge ? ink.outline : null);
      return;
    }

    if (v.phase === 'crashed') {
      const crash = theme.crashes[this.crashVariant % theme.crashes.length];
      const since = (now - this.crashAt) / 1000;
      const drop = (1 - ease(since / 0.4)) * -big * 0.4;
      const wob = Math.sin(since * 9) * Math.max(0, 1 - since) * 0.06;
      c.save();
      c.translate(cx, cy + drop);
      c.rotate(wob);
      c.translate(-cx, -cy);
      glowText(crash.title, cy - big * 0.3, Math.round(Math.min(big * 0.56, W * 0.12)), ink.crashTitle);
      glowText(`@ ${fmtX(v.crash)}×`, cy + big * 0.36, Math.round(big * 0.48), ink.crashSub);
      c.restore();
      c.font = "800 14px 'IBM Plex Mono', monospace";
      if (v.you && v.you.cashedAt === null) {
        c.fillStyle = ink.lose;
        edged(c, `−${v.you.amount.toLocaleString('en-US')}`, cx, cy + big * 0.86, ink.edge ? ink.outline : null);
      } else if (v.you) {
        c.fillStyle = ink.win;
        edged(c, `You got out at ${fmtX(v.you.cashedAt!)}× · +${(v.you.payout - v.you.amount).toLocaleString('en-US')}`, cx, cy + big * 0.86, ink.edge ? ink.outline : null);
      }
      if (crash.caption && H >= 250) {
        c.globalAlpha = clamp((since - 0.3) / 0.4);
        c.font = '700 italic 12px Rubik, sans-serif';
        c.fillStyle = ink.caption;
        edged(c, crash.caption, cx, cy + big * 0.86 + 20, ink.edge ? ink.outline : null);
        c.globalAlpha = 1;
      }
      return;
    }

    // The rush: the number, jittering more the higher it goes.
    const sinceLaunch = (now - this.launchAt) / 1000;
    const jit = this.calm ? 0 : Math.min(3, Math.log2(v.m) * 0.8);
    const size = Math.round(big * (sinceLaunch < 0.3 ? 0.8 + sinceLaunch * 0.66 : 1));
    c.save();
    c.translate((Math.random() - 0.5) * jit, (Math.random() - 0.5) * jit);
    glowText(`${fmtX(v.m)}×`, cy, size, theme.heat(v.m));
    c.restore();
    if (v.you) {
      c.font = "800 14px 'IBM Plex Mono', monospace";
      if (v.you.cashedAt === null) {
        c.fillStyle = ink.cash;
        edged(c, `Cash out ${Math.floor((v.you.amount * Math.floor(v.m * 100 + 1e-9)) / 100).toLocaleString('en-US')}`, cx, cy + big * 0.62, ink.edge ? ink.outline : null);
      } else {
        c.fillStyle = ink.win;
        edged(c, `Cashed out at ${fmtX(v.you.cashedAt)}× · +${(v.you.payout - v.you.amount).toLocaleString('en-US')}`, cx, cy + big * 0.62, ink.edge ? ink.outline : null);
      }
    }
    // Milestone shouts.
    for (const p of this.pops) {
      const age = (now - p.born) / 1000;
      if (age > 1.6) continue;
      const k = ease(age / 0.25);
      c.globalAlpha = Math.min(1, (1.6 - age) / 0.5);
      c.save();
      c.translate(cx, cy - big * 0.78 - age * 12);
      c.rotate(Math.sin(age * 14) * 0.05);
      fitText(c, p.text, (px) => `900 italic ${px}px Rubik, sans-serif`, Math.round(Math.min(W * 0.075, 30) * (0.6 + k * 0.4)), W * 0.92);
      c.lineWidth = 5;
      c.strokeStyle = ink.outline;
      c.strokeText(p.text, 0, 0);
      c.fillStyle = p.color;
      c.fillText(p.text, 0, 0);
      c.restore();
      c.globalAlpha = 1;
    }
  }
}
