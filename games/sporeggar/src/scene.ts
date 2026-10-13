// The banner: Sporeggar's night market under giant glowing mushrooms, with
// lanterns on a string, drifting spores and the stall's striped awning.
// Tapping it forages for caps.
import { mulberry32 } from '@shared/rng';

interface Shroom {
  x: number;
  h: number;
  w: number;
  lean: number;
  far: boolean;
  spots: { a: number; r: number; d: number }[];
}

interface Spore {
  x: number;
  y: number;
  speed: number;
  phase: number;
  r: number;
  violet: boolean;
}

interface Burst {
  x: number;
  y: number;
  born: number;
  text: string;
  bits: { vx: number; vy: number; r: number }[];
}

const TAU = Math.PI * 2;

export class TownScene {
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement('canvas');
  private W = 0;
  private H = 0;
  private dpr = 1;
  private shrooms: Shroom[] = [];
  private spores: Spore[] = [];
  private bursts: Burst[] = [];
  private t = 0;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas: HTMLCanvasElement, seed = 7) {
    this.ctx = canvas.getContext('2d')!;
    const rnd = mulberry32(seed);
    const r = (a: number, b: number) => a + rnd() * (b - a);
    const spots = () => Array.from({ length: 5 }, () => ({ a: r(-0.8, 0.8), r: r(0.04, 0.09), d: r(0.25, 0.7) }));
    // Far row, then a few big ones in front.
    for (let i = 0; i < 7; i++) {
      this.shrooms.push({ x: (i + r(0.1, 0.9)) / 7, h: r(0.5, 0.8), w: r(0.12, 0.2), lean: r(-0.02, 0.02), far: true, spots: spots() });
    }
    for (const x of [0.07, 0.36, 0.93]) {
      this.shrooms.push({ x: x + r(-0.03, 0.03), h: r(0.78, 0.95), w: r(0.22, 0.3), lean: r(-0.03, 0.03), far: false, spots: spots() });
    }
    this.spores = Array.from({ length: 46 }, () => ({
      x: rnd(),
      y: rnd(),
      speed: r(0.01, 0.035),
      phase: r(0, TAU),
      r: r(0.6, 1.8),
      violet: rnd() < 0.35,
    }));
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(100, rect.width);
    this.H = Math.max(80, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(this.W * this.dpr);
      c.height = Math.round(this.H * this.dpr);
    }
    this.paintBase();
  }

  private groundY(): number {
    return this.H - Math.max(26, this.H * 0.17);
  }

  private paintBase(): void {
    const c = this.base.getContext('2d')!;
    const { W, H } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b0f1e');
    sky.addColorStop(0.55, '#141c36');
    sky.addColorStop(1, '#1d3442');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    const gy = this.groundY();

    // Swamp haze on the horizon.
    const haze = c.createLinearGradient(0, gy - H * 0.35, 0, gy);
    haze.addColorStop(0, 'rgba(90,200,190,0)');
    haze.addColorStop(1, 'rgba(90,200,190,0.16)');
    c.fillStyle = haze;
    c.fillRect(0, gy - H * 0.35, W, H * 0.35);

    for (const s of this.shrooms) this.paintShroom(c, s, gy);

    // Ground and reeds.
    c.fillStyle = '#0a0e19';
    c.fillRect(0, gy, W, H - gy);
    c.strokeStyle = '#0a0e19';
    c.lineWidth = 1.4;
    for (let i = 0; i < W / 5; i++) {
      const x = (i * 5 + Math.sin(i * 12.9) * 3) % W;
      const h = 6 + Math.abs(Math.sin(i * 7.3)) * 12;
      c.beginPath();
      c.moveTo(x, gy + 1);
      c.quadraticCurveTo(x + 2, gy - h * 0.6, x + Math.sin(i) * 3, gy - h);
      c.stroke();
    }

    // The stall's awning along the bottom edge.
    const aw = Math.max(16, H * 0.11);
    const top = H - aw;
    const stripes = Math.max(8, Math.round(W / 34));
    const sw = W / stripes;
    for (let i = 0; i < stripes; i++) {
      c.fillStyle = i % 2 ? '#3a2a5c' : '#c9894a';
      c.beginPath();
      c.moveTo(i * sw, top);
      c.lineTo((i + 1) * sw, top);
      c.lineTo((i + 1) * sw, H - aw * 0.35);
      c.quadraticCurveTo((i + 0.5) * sw, H + aw * 0.2, i * sw, H - aw * 0.35);
      c.closePath();
      c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, top, W, 2);
  }

  private paintShroom(c: CanvasRenderingContext2D, s: Shroom, gy: number): void {
    const { W } = this;
    const x = s.x * W;
    const h = s.h * (gy - 6);
    const w = Math.max(40, s.w * W);
    const cx = x + s.lean * W;
    const cy = gy - h;
    const stem = s.far ? '#16233a' : '#0e1526';
    const cap = s.far ? '#1c2a48' : '#121a33';
    // Stalk.
    c.fillStyle = stem;
    c.beginPath();
    c.moveTo(x - w * 0.07, gy);
    c.quadraticCurveTo(x - w * 0.05, gy - h * 0.5, cx - w * 0.05, cy);
    c.lineTo(cx + w * 0.05, cy);
    c.quadraticCurveTo(x + w * 0.05, gy - h * 0.5, x + w * 0.08, gy);
    c.closePath();
    c.fill();
    // Glowing gills under the cap.
    const glow = c.createRadialGradient(cx, cy + 4, 2, cx, cy + 4, w * 0.6);
    glow.addColorStop(0, s.far ? 'rgba(110,230,205,0.22)' : 'rgba(120,240,210,0.35)');
    glow.addColorStop(1, 'rgba(110,230,205,0)');
    c.fillStyle = glow;
    c.beginPath();
    c.ellipse(cx, cy + 6, w * 0.6, w * 0.22, 0, 0, TAU);
    c.fill();
    // Cap.
    c.fillStyle = cap;
    c.beginPath();
    c.ellipse(cx, cy, w / 2, w * 0.2, 0, Math.PI, TAU);
    c.quadraticCurveTo(cx, cy + w * 0.07, cx - w / 2, cy);
    c.fill();
    // Spots that glow faintly.
    for (const sp of s.spots) {
      c.fillStyle = s.far ? 'rgba(160,140,255,0.18)' : 'rgba(180,150,255,0.32)';
      c.beginPath();
      c.ellipse(cx + sp.a * w * 0.42, cy - sp.d * w * 0.17, sp.r * w * 0.6, sp.r * w * 0.3, 0, 0, TAU);
      c.fill();
    }
  }

  /** Forage feedback at a point: a puff of spores and the caps found. */
  burst(x: number, y: number, text: string): void {
    const n = this.calm ? 3 : 9;
    this.bursts.push({
      x,
      y,
      born: this.t,
      text,
      bits: Array.from({ length: n }, () => {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const v = 20 + Math.random() * 45;
        return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 0.8 + Math.random() * 1.6 };
      }),
    });
    if (this.bursts.length > 16) this.bursts.shift();
  }

  draw(t: number): void {
    this.t = t;
    const c = this.ctx;
    const { W, H } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.drawImage(this.base, 0, 0, W, H);

    // Lantern string between the middle and right front mushrooms, low on
    // their stalks so it stays clear of the name and purse.
    const gy = this.groundY();
    const front = this.shrooms.filter((s) => !s.far);
    const a = front[1];
    const b = front[2];
    const ax = a.x * W;
    const bx = b.x * W;
    const ay = gy - a.h * (gy - 6) * 0.42;
    const by = gy - b.h * (gy - 6) * 0.42;
    const sag = 14;
    const sway = this.calm ? 0 : Math.sin(t * 0.0009) * 2;
    c.strokeStyle = 'rgba(20,24,40,0.9)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(ax, ay);
    c.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + sag, bx, by);
    c.stroke();
    for (let i = 1; i < 7; i++) {
      const f = i / 7;
      const lx = (1 - f) * (1 - f) * ax + 2 * (1 - f) * f * ((ax + bx) / 2) + f * f * bx;
      const ly = (1 - f) * (1 - f) * ay + 2 * (1 - f) * f * (Math.max(ay, by) + sag) + f * f * by;
      const swing = sway * Math.sin(i * 1.7 + t * 0.002);
      const px = lx + swing;
      const py = ly + 9;
      c.strokeStyle = 'rgba(20,24,40,0.9)';
      c.beginPath();
      c.moveTo(lx, ly);
      c.lineTo(px, py - 3);
      c.stroke();
      const flicker = 0.8 + Math.sin(t * 0.006 + i * 2.1) * 0.12;
      const halo = c.createRadialGradient(px, py, 0, px, py, 16);
      halo.addColorStop(0, `rgba(255,190,100,${0.45 * flicker})`);
      halo.addColorStop(1, 'rgba(255,190,100,0)');
      c.fillStyle = halo;
      c.beginPath();
      c.arc(px, py, 16, 0, TAU);
      c.fill();
      c.fillStyle = '#ffcf7a';
      c.beginPath();
      c.ellipse(px, py, 3, 4, 0, 0, TAU);
      c.fill();
    }

    // Drifting spores.
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const s of this.spores) {
      const y = (((s.y - (t / 1000) * s.speed) % 1) + 1) % 1;
      const x = s.x * W + Math.sin(t * 0.0006 + s.phase) * 8;
      const tw = 0.45 + Math.sin(t * 0.003 + s.phase * 3) * 0.3;
      c.globalAlpha = tw;
      c.fillStyle = s.violet ? '#c8a6ff' : '#86f2d6';
      c.beginPath();
      c.arc(x, y * (gy + 10), s.r, 0, TAU);
      c.fill();
    }
    c.restore();

    // Forage bursts.
    c.font = '600 15px Figtree, system-ui, sans-serif';
    c.textAlign = 'center';
    this.bursts = this.bursts.filter((b) => {
      const age = (t - b.born) / 1000;
      if (age > 1) return false;
      c.globalAlpha = 1 - age;
      c.fillStyle = '#9af5dc';
      for (const p of b.bits) {
        c.beginPath();
        c.arc(b.x + p.vx * age, b.y + p.vy * age + 14 * age * age, p.r, 0, TAU);
        c.fill();
      }
      c.fillStyle = 'rgba(5,8,16,0.7)';
      c.fillText(b.text, b.x + 1, b.y - 10 - age * 36 + 1);
      c.fillStyle = '#ffd590';
      c.fillText(b.text, b.x, b.y - 10 - age * 36);
      return true;
    });
    c.globalAlpha = 1;
  }
}
