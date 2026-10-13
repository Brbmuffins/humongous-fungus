// Draws the terrarium: a glass jar on a shelf, a soil cross-section with the
// player's mycelium network, and everything the network has grown.
import type { ProducerId } from '../game/defs';
import { mulberry32 } from '../game/rng';
import * as O from './organisms';
import { paletteFor, type Palette } from './palette';

export interface WorldView {
  counts: Record<ProducerId, number>;
  specimens: ReadonlySet<string>;
  jarIndex: number;
  seed: number;
  rate: number;
  /** Mycelium segments to show. */
  network: number;
  frenzy: boolean;
  bloom: { x: number; bornAt: number; ttl: number } | null;
  /** Date.now() for this frame. */
  now: number;
}

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  parent: number;
  gen: number;
}

interface Layout {
  segs: Seg[];
  surface: number[];
  pebbles: { x: number; y: number; r: number; tone: number }[];
  specks: { x: number; y: number; r: number; light: boolean }[];
  litter: { x: number; a: number; len: number; c: number }[];
  bonnets: { x: number; h: number; lean: number }[];
  moss: { x: number; w: number }[];
  ferns: { x: number; h: number; phase: number }[];
  springtails: { x: number; phase: number; period: number }[];
  pillbugs: { x0: number; x1: number; speed: number; phase: number; s: number }[];
  snails: { x0: number; x1: number; speed: number; phase: number }[];
  frogs: { onWood: boolean; at: number; dir: number; phase: number }[];
  droplets: { x: number; y: number; r: number }[];
  wood: { x1: number; x2: number; rise: number; bend: number };
}

interface Geo {
  W: number;
  H: number;
  cx: number;
  L: number;
  R: number;
  top: number;
  bottom: number;
  neckL: number;
  neckR: number;
  neckTop: number;
  bodyTop: number;
  iL: number;
  iR: number;
  iW: number;
  iTop: number;
  iBottom: number;
  soilTop: number;
  pebbleTop: number;
  jarW: number;
  jarH: number;
  corkH: number;
  /** Scale unit: 1 for a jar 260px wide. */
  u: number;
  shelfY: number;
  path: Path2D;
}

interface Pulse {
  chain: number[];
  born: number;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  r: number;
  color: string;
}

interface FloatText {
  x: number;
  y: number;
  born: number;
  text: string;
}

const MAX_SEGS = 760;
const SLOTS = { bonnet: 14, moss: 12, fern: 6, springtail: 24, pillbug: 8, snail: 5, frog: 3 };

/** 1 at the first purchase, then slowly more as the count grows. */
export function visibleCount(n: number, max: number, k: number): number {
  return n <= 0 ? 0 : Math.min(max, 1 + Math.floor(Math.sqrt(n - 1) * k));
}

function makeLayout(seed: number): Layout {
  const rnd = mulberry32(seed);
  const r = (a: number, b: number) => a + rnd() * (b - a);

  let surface = Array.from({ length: 33 }, () => r(-1, 1));
  for (let pass = 0; pass < 2; pass++) {
    surface = surface.map((v, i, a) => (a[Math.max(0, i - 1)] + v * 2 + a[Math.min(a.length - 1, i + 1)]) / 4);
  }

  const centers = [0.24, 0.5, 0.76].map((c) => c + r(-0.05, 0.05));
  const bonnets = Array.from({ length: SLOTS.bonnet }, (_, i) => ({
    x: centers[i % 3] + r(-0.08, 0.08),
    h: r(15, 25),
    lean: r(-3.5, 3.5),
  }));

  // Stratified, then shuffled, so the first patches spread across the jar.
  const moss = Array.from({ length: SLOTS.moss }, (_, i) => ({ x: (i + r(0.15, 0.85)) / SLOTS.moss, w: r(22, 36) }));
  for (let i = moss.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [moss[i], moss[j]] = [moss[j], moss[i]];
  }

  const fernX = [0.86, 0.13, 0.66, 0.35, 0.95, 0.52];
  const ferns = fernX.map((x, i) => ({ x: x + r(-0.03, 0.03), h: r(72, 92) - i * 5, phase: r(0, 6) }));

  const flip = rnd() < 0.5;
  const wx1 = r(0.06, 0.12);
  const wx2 = r(0.55, 0.64);
  const wood = {
    x1: flip ? 1 - wx1 : wx1,
    x2: flip ? 1 - wx2 : wx2,
    rise: r(0.4, 0.52),
    bend: r(-0.06, 0.06),
  };

  return {
    segs: growNetwork(rnd, centers),
    surface,
    pebbles: Array.from({ length: 80 }, () => ({ x: r(0, 1), y: r(0.1, 1), r: r(0.7, 1.5), tone: rnd() })),
    specks: Array.from({ length: 110 }, () => ({ x: r(0, 1), y: r(0, 1), r: r(0.4, 1.2), light: rnd() < 0.5 })),
    litter: Array.from({ length: 28 }, () => ({ x: r(0, 1), a: r(-0.7, 0.7), len: r(3, 6.5), c: Math.floor(r(0, 4)) })),
    bonnets,
    moss,
    ferns,
    springtails: Array.from({ length: SLOTS.springtail }, () => ({
      x: r(0.04, 0.96),
      phase: r(0, 10_000),
      period: r(2200, 5200),
    })),
    pillbugs: Array.from({ length: SLOTS.pillbug }, () => {
      const x0 = r(0.05, 0.5);
      return { x0, x1: Math.min(0.95, x0 + r(0.2, 0.45)), speed: r(0.008, 0.015), phase: rnd(), s: r(0.85, 1.1) };
    }),
    snails: Array.from({ length: SLOTS.snail }, () => {
      const x0 = r(0.08, 0.6);
      return { x0, x1: Math.min(0.92, x0 + r(0.15, 0.3)), speed: r(0.002, 0.004), phase: rnd() };
    }),
    frogs: [
      { onWood: true, at: 0.74, dir: flip ? -1 : 1, phase: r(0, 6) },
      { onWood: false, at: flip ? 0.2 : 0.8, dir: flip ? 1 : -1, phase: r(0, 6) },
      { onWood: true, at: 0.4, dir: flip ? -1 : 1, phase: r(0, 6) },
    ],
    droplets: Array.from({ length: 48 }, () => {
      const side = rnd();
      const x = side < 0.4 ? r(0, 0.16) : side < 0.8 ? r(0.84, 1) : r(0.16, 0.84);
      return { x, y: r(0, 0.6), r: r(0.7, 2.2) };
    }),
    wood,
  };
}

/** Grow the whole network once; the game reveals it segment by segment. */
function growNetwork(rnd: () => number, roots: number[]): Seg[] {
  interface Tip {
    x: number;
    y: number;
    a: number;
    gen: number;
    parent: number;
    life: number;
  }
  const aspect = 2.4; // soil band is about this much wider than tall
  const segs: Seg[] = [];
  const tips: Tip[] = roots.map((x) => ({
    x,
    y: 0.02,
    a: Math.PI / 2 + (rnd() - 0.5) * 0.9,
    gen: 0,
    parent: -1,
    life: 30 + rnd() * 30,
  }));
  let i = 0;
  while (segs.length < MAX_SEGS) {
    if (tips.length === 0) {
      const from = segs[Math.floor(rnd() * segs.length)];
      tips.push({ x: from.x2, y: from.y2, a: rnd() * Math.PI * 2, gen: from.gen + 1, parent: segs.indexOf(from), life: 12 + rnd() * 20 });
    }
    const k = i % tips.length;
    const t = tips[k];
    const len = 0.016 + rnd() * 0.026;
    t.a += (rnd() - 0.5) * 0.75;
    let nx = t.x + Math.cos(t.a) * len;
    let ny = t.y + Math.sin(t.a) * len * aspect;
    if (nx < 0.02 || nx > 0.98) {
      t.a = Math.PI - t.a;
      nx = Math.min(0.98, Math.max(0.02, nx));
    }
    if (ny < 0.02) {
      t.a = Math.abs(t.a);
      ny = 0.02;
    } else if (ny > 0.97) {
      t.a = -Math.abs(t.a);
      ny = 0.97;
    }
    segs.push({ x1: t.x, y1: t.y, x2: nx, y2: ny, parent: t.parent, gen: t.gen });
    t.parent = segs.length - 1;
    t.x = nx;
    t.y = ny;
    t.life -= 1;
    if (rnd() < 0.15 && tips.length < 44) {
      tips.push({
        x: nx,
        y: ny,
        a: t.a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7),
        gen: t.gen + 1,
        parent: t.parent,
        life: 14 + rnd() * 24,
      });
    }
    if (t.life <= 0) tips.splice(k, 1);
    else i += 1;
  }
  return segs;
}

function makeGeo(W: number, H: number): Geo {
  const shelfY = H - Math.max(12, H * 0.055);
  const ratio = 0.84;
  let jarH = Math.min(H * 0.9, (W - 32) / ratio);
  let jarW = jarH * ratio;
  if (jarW > W - 32) {
    jarW = W - 32;
    jarH = jarW / ratio;
  }
  const cx = W / 2;
  const bottom = shelfY;
  const top = bottom - jarH;
  const L = cx - jarW / 2;
  const R = cx + jarW / 2;
  const neckW = jarW * 0.6;
  const neckL = cx - neckW / 2;
  const neckR = cx + neckW / 2;
  const corkH = jarH * 0.085;
  const neckTop = top + corkH * 0.72;
  const shoulderY = top + corkH + jarH * 0.045;
  const bodyTop = shoulderY + jarH * 0.09;
  const glass = 3;
  const bodyH = bottom - bodyTop;
  const rad = jarW * 0.13;

  const path = new Path2D();
  path.moveTo(neckL, neckTop);
  path.lineTo(neckL, shoulderY);
  path.quadraticCurveTo(L, shoulderY, L, bodyTop);
  path.lineTo(L, bottom - rad);
  path.quadraticCurveTo(L, bottom, L + rad, bottom);
  path.lineTo(R - rad, bottom);
  path.quadraticCurveTo(R, bottom, R, bottom - rad);
  path.lineTo(R, bodyTop);
  path.quadraticCurveTo(R, shoulderY, neckR, shoulderY);
  path.lineTo(neckR, neckTop);
  path.closePath();

  return {
    W,
    H,
    cx,
    L,
    R,
    top,
    bottom,
    neckL,
    neckR,
    neckTop,
    bodyTop,
    iL: L + glass,
    iR: R - glass,
    iW: jarW - glass * 2,
    iTop: neckTop,
    iBottom: bottom - glass,
    soilTop: bottom - bodyH * 0.38,
    pebbleTop: bottom - bodyH * 0.11,
    jarW,
    jarH,
    corkH,
    u: jarW / 260,
    shelfY,
    path,
  };
}

export class JarRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private g!: Geo;
  private layout!: Layout;
  private seed = -1;
  private jarIndex = -1;
  private pal: Palette = paletteFor(0);
  private view: WorldView | null = null;

  private base: HTMLCanvasElement = document.createElement('canvas');
  private net: HTMLCanvasElement = document.createElement('canvas');
  private netShown = 0;
  private netBaked = 0;
  private bornAt = new Float64Array(MAX_SEGS);

  private pulses: Pulse[] = [];
  private nextPulse = 0;
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private runner: { x: number; y: number; born: number } | null = null;
  private nextRunner = 4000;
  private squashAt = -1e9;
  private t = 0;
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(200, rect.width);
    const H = Math.max(200, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.canvas, this.base, this.net]) {
      c.width = Math.round(W * this.dpr);
      c.height = Math.round(H * this.dpr);
    }
    this.g = makeGeo(W, H);
    if (this.layout) this.rebuildLayers();
  }

  /** Set what the jar should show. Call every frame before draw(). */
  setView(v: WorldView): void {
    const fresh = v.seed !== this.seed || v.jarIndex !== this.jarIndex;
    this.view = v;
    if (fresh) {
      this.seed = v.seed;
      this.jarIndex = v.jarIndex;
      this.pal = paletteFor(v.jarIndex);
      this.layout = makeLayout(v.seed);
      this.netShown = 0;
      this.pulses = [];
      this.rebuildLayers();
    }
    const target = Math.min(MAX_SEGS, Math.floor(v.network));
    if (target < this.netShown) {
      this.netShown = target;
      this.rebuildLayers();
    } else if (target > this.netShown) {
      const start = this.netShown;
      for (let i = start; i < target; i++) {
        // On the very first frame show the network as it is; later growth animates.
        this.bornAt[i] = fresh ? -1e9 : this.t + Math.min(1500, (i - start) * 22);
      }
      this.netShown = target;
    }
  }

  // -------------------------------------------------------------------------
  // Coordinates

  private sx(nx: number): number {
    return this.g.iL + nx * this.g.iW;
  }

  surfaceY(nx: number): number {
    const s = this.layout.surface;
    const f = Math.min(1, Math.max(0, nx)) * (s.length - 1);
    const i = Math.floor(f);
    const v = s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (f - i);
    return this.g.soilTop + v * 3.5 * this.g.u;
  }

  private netX(nx: number): number {
    return this.sx(nx);
  }

  private netY(ny: number): number {
    const { soilTop, pebbleTop, u } = this.g;
    return soilTop + 5 * u + ny * (pebbleTop - soilTop - 8 * u);
  }

  private woodPoint(t: number): { x: number; y: number; angle: number } {
    const { wood } = this.layout;
    const x1 = this.sx(wood.x1);
    const y1 = this.surfaceY(wood.x1) + 4 * this.g.u;
    const x2 = this.sx(wood.x2);
    const y2 = this.g.soilTop - (this.g.soilTop - this.g.iTop) * wood.rise;
    const cx = (x1 + x2) / 2 + wood.bend * this.g.iW;
    const cy = (y1 + y2) / 2 - 10 * this.g.u;
    const u = 1 - t;
    const x = u * u * x1 + 2 * u * t * cx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * cy + t * t * y2;
    const dx = 2 * u * (cx - x1) + 2 * t * (x2 - cx);
    const dy = 2 * u * (cy - y1) + 2 * t * (y2 - cy);
    return { x, y, angle: Math.atan2(dy, dx) };
  }

  // -------------------------------------------------------------------------
  // Cached layers

  private rebuildLayers(): void {
    const b = this.base.getContext('2d')!;
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    b.clearRect(0, 0, this.g.W, this.g.H);
    this.drawRoom(b);
    b.save();
    b.clip(this.g.path);
    this.drawAir(b);
    this.drawSoil(b);
    this.drawWood(b);
    b.restore();

    const n = this.net.getContext('2d')!;
    n.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    n.clearRect(0, 0, this.g.W, this.g.H);
    this.netBaked = 0;
    this.bakeNetwork(Infinity);
  }

  private drawRoom(c: CanvasRenderingContext2D): void {
    const { W, H, cx, top, jarH, jarW, shelfY } = this.g;
    const pal = this.pal;
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.room[0]);
    bg.addColorStop(1, pal.room[1]);
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    const lamp = c.createRadialGradient(cx, top + jarH * 0.25, 0, cx, top + jarH * 0.25, Math.max(W, jarW * 1.2));
    lamp.addColorStop(0, pal.lamp);
    lamp.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lamp;
    c.fillRect(0, 0, W, H);
    c.fillStyle = pal.shelf;
    c.fillRect(0, shelfY, W, H - shelfY);
    c.fillStyle = pal.shelfEdge;
    c.fillRect(0, shelfY, W, 1.5);
    c.save();
    c.translate(cx, shelfY + 1);
    c.scale(1, 0.12);
    const sh = c.createRadialGradient(0, 0, 0, 0, 0, jarW * 0.62);
    sh.addColorStop(0, 'rgba(0,0,0,0.6)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh;
    c.beginPath();
    c.arc(0, 0, jarW * 0.62, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  private drawAir(c: CanvasRenderingContext2D): void {
    const { iTop, soilTop, L, R } = this.g;
    const air = c.createLinearGradient(0, iTop, 0, soilTop);
    air.addColorStop(0, this.pal.air[0]);
    air.addColorStop(1, this.pal.air[1]);
    c.fillStyle = air;
    c.fillRect(L, iTop - 10, R - L, soilTop - iTop + 20);
  }

  private drawSoil(c: CanvasRenderingContext2D): void {
    const { L, R, iL, iW, soilTop, pebbleTop, bottom, u } = this.g;
    const pal = this.pal;
    const L0 = this.layout;
    // Soil body following the surface.
    c.beginPath();
    c.moveTo(L - 2, this.surfaceY(0));
    for (let i = 0; i <= 40; i++) c.lineTo(iL + (i / 40) * iW, this.surfaceY(i / 40));
    c.lineTo(R + 2, this.surfaceY(1));
    c.lineTo(R + 2, bottom + 2);
    c.lineTo(L - 2, bottom + 2);
    c.closePath();
    const sg = c.createLinearGradient(0, soilTop, 0, pebbleTop);
    sg.addColorStop(0, pal.soil[0]);
    sg.addColorStop(1, pal.soil[1]);
    c.fillStyle = sg;
    c.fill();

    // Drainage layer: charcoal line, then pebbles.
    c.fillStyle = pal.charcoal;
    c.fillRect(L, pebbleTop - 2 * u, R - L, 2.5 * u);
    c.fillStyle = pal.pebble[0];
    c.fillRect(L, pebbleTop, R - L, bottom - pebbleTop + 2);
    for (const p of L0.pebbles) {
      const x = iL + p.x * iW;
      const y = pebbleTop + 2 * u + p.y * (bottom - pebbleTop - 2 * u);
      const r = p.r * 3.4 * u;
      c.fillStyle = p.tone < 0.5 ? pal.pebble[1] : pal.pebble[2];
      c.beginPath();
      c.ellipse(x, y, r * 1.2, r, p.tone * 2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.beginPath();
      c.arc(x - r * 0.4, y - r * 0.4, r * 0.35, 0, Math.PI * 2);
      c.fill();
    }

    for (const s of L0.specks) {
      const x = iL + s.x * iW;
      const y = soilTop + 4 * u + s.y * (pebbleTop - soilTop - 6 * u);
      c.fillStyle = s.light ? pal.speck[0] : pal.speck[1];
      c.beginPath();
      c.arc(x, y, s.r * u, 0, Math.PI * 2);
      c.fill();
    }

    for (const l of L0.litter) {
      const x = iL + l.x * iW;
      const y = this.surfaceY(l.x) - 0.5 * u;
      c.fillStyle = pal.litter[l.c];
      c.beginPath();
      c.ellipse(x, y, l.len * u, 1.5 * u, l.a, 0, Math.PI * 2);
      c.fill();
    }
  }

  private drawWood(c: CanvasRenderingContext2D): void {
    const { u } = this.g;
    const steps = 24;
    for (const pass of [0, 1]) {
      c.beginPath();
      for (let i = 0; i <= steps; i++) {
        const p = this.woodPoint(i / steps);
        if (i === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      }
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (pass === 0) {
        c.strokeStyle = this.pal.woodDark;
        c.lineWidth = 11 * u;
      } else {
        c.strokeStyle = this.pal.wood;
        c.lineWidth = 8 * u;
      }
      c.stroke();
    }
    // Bark highlights.
    c.strokeStyle = this.pal.woodHi;
    c.lineWidth = 1 * u;
    for (let i = 1; i < 9; i++) {
      const p = this.woodPoint(i / 10);
      const nx = -Math.sin(p.angle);
      const ny = Math.cos(p.angle);
      c.beginPath();
      c.moveTo(p.x - nx * 2.5 * u, p.y - ny * 2.5 * u);
      c.lineTo(p.x + Math.cos(p.angle) * 5 * u - nx * 2.5 * u, p.y + Math.sin(p.angle) * 5 * u - ny * 2.5 * u);
      c.stroke();
    }
  }

  private segProgress(i: number): number {
    return Math.min(1, Math.max(0, (this.t - this.bornAt[i]) / 450));
  }

  private strokeSeg(c: CanvasRenderingContext2D, i: number, progress: number): void {
    const s = this.layout.segs[i];
    const x1 = this.netX(s.x1);
    const y1 = this.netY(s.y1);
    const x2 = x1 + (this.netX(s.x2) - x1) * progress;
    const y2 = y1 + (this.netY(s.y2) - y1) * progress;
    c.globalAlpha = Math.max(0.3, 0.85 - s.gen * 0.07);
    c.lineWidth = Math.max(0.6, (1.7 - s.gen * 0.16) * this.g.u);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  /** Move finished segments onto the cached network layer, in order. */
  private bakeNetwork(limit: number): void {
    const c = this.net.getContext('2d')!;
    c.strokeStyle = this.pal.myc;
    c.lineCap = 'round';
    let n = 0;
    while (this.netBaked < this.netShown && this.segProgress(this.netBaked) >= 1 && n < limit) {
      this.strokeSeg(c, this.netBaked, 1);
      this.netBaked += 1;
      n += 1;
    }
    c.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // Effects

  /** A tap at canvas coordinates: ripple of spores, a number, a squash. */
  tap(x: number, y: number, label: string): void {
    this.squashAt = this.t;
    const count = this.reducedMotion ? 2 : 6;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 20 + Math.random() * 40;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        born: this.t,
        life: 700 + Math.random() * 500,
        r: 1 + Math.random() * 1.6,
        color: this.pal.pulse,
      });
    }
    this.texts.push({ x: x + (Math.random() - 0.5) * 16, y: y - 8, born: this.t, text: label });
    if (this.texts.length > 24) this.texts.shift();
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
    for (let i = 0; i < 2; i++) this.spawnPulse();
  }

  /** A burst from the soil, for purchases and collecting. */
  burst(count = 14): void {
    const { cx, soilTop, jarW } = this.g;
    for (let i = 0; i < (this.reducedMotion ? 4 : count); i++) {
      const x = cx + (Math.random() - 0.5) * jarW * 0.7;
      this.particles.push({
        x,
        y: soilTop,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 50,
        born: this.t,
        life: 900 + Math.random() * 700,
        r: 1 + Math.random() * 1.8,
        color: Math.random() < 0.5 ? this.pal.pulse : this.pal.myc,
      });
    }
  }

  bloomPosition(b: { x: number }): { x: number; y: number } {
    return { x: this.sx(b.x), y: this.surfaceY(b.x) };
  }

  hitBloom(x: number, y: number): boolean {
    const b = this.view?.bloom;
    if (!b) return false;
    const p = this.bloomPosition(b);
    const r = Math.max(26, 22 * this.g.u);
    return Math.hypot(x - p.x, y - (p.y - 10 * this.g.u)) <= r;
  }

  private spawnPulse(): void {
    const n = this.netBaked;
    if (n < 2 || this.pulses.length > 40) return;
    let i = Math.floor(Math.random() * n);
    const chain: number[] = [];
    while (i >= 0 && chain.length < 60) {
      chain.push(i);
      i = this.layout.segs[i].parent;
    }
    this.pulses.push({ chain, born: this.t, speed: 70 + Math.random() * 50 });
  }

  // -------------------------------------------------------------------------
  // Frame

  draw(t: number): void {
    const v = this.view;
    if (!v || !this.layout) return;
    this.t = t;
    const { ctx, g, pal } = this;
    const L = this.layout;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.bakeNetwork(40);
    if (t >= this.nextPulse) {
      this.spawnPulse();
      const base = 900 - 110 * Math.log10(v.rate + 1);
      this.nextPulse = t + Math.max(90, base) / (v.frenzy ? 3 : 1);
    }

    ctx.drawImage(this.base, 0, 0, g.W, g.H);

    ctx.save();
    const sq = this.reducedMotion ? 0 : Math.max(0, 1 - (t - this.squashAt) / 200);
    if (sq > 0) {
      const k = Math.sin(sq * Math.PI) * 0.012;
      ctx.translate(g.cx, g.bottom);
      ctx.scale(1 + k, 1 - k);
      ctx.translate(-g.cx, -g.bottom);
    }
    ctx.save();
    ctx.clip(g.path);
    if (sq > 0) {
      // Keep the cached layer inside the squashed jar.
      ctx.drawImage(this.base, 0, 0, g.W, g.H);
    }

    // Network: baked layer, then growing segments, then pulses.
    ctx.drawImage(this.net, 0, 0, g.W, g.H);
    ctx.strokeStyle = pal.myc;
    ctx.lineCap = 'round';
    for (let i = this.netBaked; i < this.netShown; i++) {
      const p = this.segProgress(i);
      if (p > 0) this.strokeSeg(ctx, i, p);
    }
    ctx.globalAlpha = 1;
    this.drawPulses(t);

    const c = v.counts;
    const u = g.u;
    const glow = v.specimens.has('glowcap') ? 0.7 + Math.sin(t * 0.0015) * 0.3 : 0;

    // Back to front: ferns, moss, mushrooms, specimens, animals.
    const ferns = visibleCount(c.fern, SLOTS.fern, 1);
    for (let i = 0; i < ferns; i++) {
      const f = L.ferns[i];
      O.fern(ctx, this.sx(f.x), this.surfaceY(f.x) + 2 * u, f.h * u * (0.75 + Math.min(1, c.fern / 60) * 0.25), pal, t, f.phase);
    }
    const mossN = visibleCount(c.moss, SLOTS.moss, 1.25);
    for (let i = 0; i < mossN; i++) {
      const m = L.moss[i];
      const grow = 0.7 + Math.min(1, c.moss / 80) * 0.4;
      O.moss(ctx, this.sx(m.x), this.surfaceY(m.x) + 1.5 * u, m.w * u * grow, pal, i * 13 + 1);
    }
    if (v.specimens.has('lichen')) {
      const p = this.woodPoint(0.12);
      O.pixieCups(ctx, p.x + 6 * u, p.y - 2 * u, u);
    }
    if (v.specimens.has('ghostpipe')) {
      const x = L.wood.x1 < 0.5 ? 0.3 : 0.7;
      O.ghostPipe(ctx, this.sx(x), this.surfaceY(x) + 1, u, t);
    }
    if (v.specimens.has('sundew')) {
      const x = L.wood.x1 < 0.5 ? 0.9 : 0.1;
      O.sundew(ctx, this.sx(x), this.surfaceY(x), u, t);
    }
    const bonnets = visibleCount(c.bonnet, SLOTS.bonnet, 1.3);
    for (let i = 0; i < bonnets; i++) {
      const b = L.bonnets[i];
      const grow = 0.8 + Math.min(1, c.bonnet / 100) * 0.35;
      O.bonnet(ctx, this.sx(b.x), this.surfaceY(b.x) + u, b.h * u * grow, b.lean * u, pal, glow);
    }
    if (v.specimens.has('glowcap')) {
      const x = L.wood.x1 < 0.5 ? 0.42 : 0.58;
      O.glowcapCluster(ctx, this.sx(x), this.surfaceY(x) + u, u, pal, t);
    }
    if (v.specimens.has('coral')) {
      const p = this.woodPoint(0.5);
      O.coral(ctx, p.x, p.y - 3 * u, u * 1.2, this.seed);
    }

    const tails = visibleCount(c.springtail, SLOTS.springtail, 2.4);
    for (let i = 0; i < tails; i++) {
      const s = L.springtails[i];
      const cycle = (t + s.phase) % s.period;
      const hopT = cycle / 320;
      const hop = hopT < 1 ? Math.sin(hopT * Math.PI) * 9 * u : 0;
      const shift = Math.floor((t + s.phase) / s.period);
      const x = Math.min(0.97, Math.max(0.03, s.x + Math.sin(shift * 1.7 + i) * 0.04 + (hopT < 1 ? hopT * 0.01 : 0.01)));
      O.springtail(ctx, this.sx(x), this.surfaceY(x) - hop, u);
    }
    const bugs = visibleCount(c.pillbug, SLOTS.pillbug, 0.95);
    for (let i = 0; i < bugs; i++) {
      const b = L.pillbugs[i];
      const span = b.x1 - b.x0;
      const period = (span * 2) / b.speed;
      const ph = (((t / 1000) / period + b.phase) % 1 + 1) % 1;
      const fwd = ph < 0.5;
      const x = b.x0 + span * (fwd ? ph * 2 : 2 - ph * 2);
      O.pillbug(ctx, this.sx(x), this.surfaceY(x) + 0.5 * u, u * b.s, fwd ? 1 : -1, t);
    }
    const snails = visibleCount(c.snail, SLOTS.snail, 0.75);
    for (let i = 0; i < snails; i++) {
      const s = L.snails[i];
      const span = s.x1 - s.x0;
      const period = (span * 2) / s.speed;
      const ph = (((t / 1000) / period + s.phase) % 1 + 1) % 1;
      const fwd = ph < 0.5;
      const k = fwd ? ph * 2 : 2 - ph * 2;
      if (i % 2 === 1) {
        const p = this.woodPoint(0.25 + k * 0.5);
        ctx.save();
        ctx.translate(p.x, p.y - 4.5 * u);
        ctx.rotate(p.angle);
        O.snail(ctx, 0, 0, u * 0.9, fwd ? 1 : -1, t);
        ctx.restore();
      } else {
        const x = s.x0 + span * k;
        O.snail(ctx, this.sx(x), this.surfaceY(x), u, fwd ? 1 : -1, t);
      }
    }
    if (v.specimens.has('beetle')) {
      const p = this.woodPoint(0.9);
      ctx.save();
      ctx.translate(p.x, p.y - 4.5 * u);
      ctx.rotate(p.angle);
      O.beetle(ctx, 0, 0, u * 1.1, -1, t);
      ctx.restore();
    }
    const frogs = visibleCount(c.frog, SLOTS.frog, 0.6);
    for (let i = 0; i < frogs; i++) {
      const f = L.frogs[i];
      const scale = u * (1.05 + Math.min(1, c.frog / 50) * 0.25);
      if (f.onWood) {
        const p = this.woodPoint(f.at);
        O.frog(ctx, p.x, p.y - 4 * u, scale, f.dir, t, f.phase);
      } else {
        O.frog(ctx, this.sx(f.at), this.surfaceY(f.at) + u, scale, f.dir, t, f.phase);
      }
    }

    if (v.bloom) {
      const life = (v.now - v.bloom.bornAt) / v.bloom.ttl;
      const p = this.bloomPosition(v.bloom);
      O.bloom(ctx, p.x, p.y + u, u, t, Math.min(1, Math.max(0, life)));
    }

    if (v.frenzy) {
      ctx.fillStyle = 'rgba(255,190,90,0.07)';
      ctx.fillRect(g.L, g.top, g.jarW, g.jarH);
    }

    this.drawGlassInside(t);
    ctx.restore();
    this.drawGlassOutside();
    ctx.restore();
    this.drawParticles(t);
  }

  private drawPulses(t: number): void {
    const { ctx } = this;
    const segs = this.layout.segs;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.pal.pulse;
    const u = this.g.u;
    this.pulses = this.pulses.filter((p) => {
      const pos = (t - p.born) / p.speed;
      const k = Math.floor(pos);
      if (k >= p.chain.length) return false;
      const s = segs[p.chain[k]];
      const f = pos - k;
      // Travel from the tip of each segment back toward the root.
      const x = this.netX(s.x2 + (s.x1 - s.x2) * f);
      const y = this.netY(s.y2 + (s.y1 - s.y2) * f);
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(x, y, 3.6 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 1.3 * u, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.restore();
  }

  private drawGlassInside(t: number): void {
    const { ctx, g } = this;
    const L = this.layout;
    const airH = g.soilTop - g.iTop;
    const fog = ctx.createLinearGradient(0, g.iTop, 0, g.iTop + airH * 0.6);
    fog.addColorStop(0, this.pal.fog);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(g.L, g.iTop, g.jarW, airH * 0.6);

    ctx.fillStyle = 'rgba(235,245,240,0.16)';
    ctx.beginPath();
    for (const d of L.droplets) {
      const x = this.sx(d.x);
      const y = g.bodyTop + d.y * (g.soilTop - g.bodyTop);
      ctx.moveTo(x + d.r * g.u, y);
      ctx.arc(x, y, d.r * g.u, 0, Math.PI * 2);
    }
    ctx.fill();

    // Now and then a drop runs down the glass.
    if (!this.reducedMotion) {
      if (!this.runner && t > this.nextRunner) {
        const d = L.droplets[Math.floor(Math.random() * L.droplets.length)];
        this.runner = { x: this.sx(d.x), y: g.bodyTop + d.y * (g.soilTop - g.bodyTop), born: t };
      }
      if (this.runner) {
        const dy = ((t - this.runner.born) / 1000) * 14 * g.u;
        const y = this.runner.y + dy;
        if (y > g.soilTop) {
          this.runner = null;
          this.nextRunner = t + 5000 + Math.random() * 7000;
        } else {
          const trail = ctx.createLinearGradient(0, this.runner.y, 0, y);
          trail.addColorStop(0, 'rgba(235,245,240,0)');
          trail.addColorStop(1, 'rgba(235,245,240,0.16)');
          ctx.strokeStyle = trail;
          ctx.lineWidth = 1.4 * g.u;
          ctx.beginPath();
          ctx.moveTo(this.runner.x, this.runner.y);
          ctx.lineTo(this.runner.x, y);
          ctx.stroke();
          ctx.fillStyle = 'rgba(235,245,240,0.35)';
          ctx.beginPath();
          ctx.arc(this.runner.x, y, 1.8 * g.u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Reflections.
    const hx = g.L + g.jarW * 0.07;
    const hl = ctx.createLinearGradient(hx, 0, hx + g.jarW * 0.06, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.13)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(hx, g.bodyTop + 6 * g.u, g.jarW * 0.06, (g.bottom - g.bodyTop) * 0.78);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(g.R - g.jarW * 0.1, g.bodyTop + 14 * g.u, g.jarW * 0.025, (g.bottom - g.bodyTop) * 0.4);
  }

  private drawGlassOutside(): void {
    const { ctx, g } = this;
    ctx.strokeStyle = 'rgba(214,232,226,0.07)';
    ctx.lineWidth = 6;
    ctx.stroke(g.path);
    ctx.strokeStyle = 'rgba(214,232,226,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke(g.path);

    // Cork.
    const w = g.neckR - g.neckL + 6 * g.u;
    const x = g.cx - w / 2;
    const y = g.top;
    const h = g.corkH;
    const cg = ctx.createLinearGradient(0, y, 0, y + h);
    cg.addColorStop(0, '#c39a6b');
    cg.addColorStop(1, '#8a653f');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3 * g.u);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,45,22,0.45)';
    for (let i = 0; i < 26; i++) {
      const px = x + O.hash(i * 3.3) * w;
      const py = y + O.hash(i * 7.1) * h;
      ctx.beginPath();
      ctx.arc(px, py, (0.5 + O.hash(i) * 0.8) * g.u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,240,215,0.18)';
    ctx.fillRect(x + 2, y + 1.5, w - 4, 1.5);
  }

  private drawParticles(t: number): void {
    const { ctx } = this;
    this.particles = this.particles.filter((p) => {
      const age = t - p.born;
      if (age > p.life) return false;
      const k = age / 1000;
      const x = p.x + p.vx * k;
      const y = p.y + p.vy * k + 12 * k * k;
      ctx.globalAlpha = 1 - age / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.font = '600 15px Rubik, system-ui, sans-serif';
    ctx.textAlign = 'center';
    this.texts = this.texts.filter((f) => {
      const age = t - f.born;
      if (age > 1000) return false;
      const k = age / 1000;
      ctx.globalAlpha = 1 - k * k;
      const y = f.y - k * 42;
      ctx.fillStyle = 'rgba(20,12,6,0.6)';
      ctx.fillText(f.text, f.x + 1, y + 1);
      ctx.fillStyle = '#f6d08a';
      ctx.fillText(f.text, f.x, y);
      return true;
    });
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // List icons: each organism in a little specimen dish.

  drawIcon(canvas: HTMLCanvasElement, kind: string, jarIndex: number): void {
    const c = canvas.getContext('2d');
    if (!c) return;
    const pal = paletteFor(jarIndex);
    const size = canvas.width;
    const k = size / 48;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.clearRect(0, 0, 48, 48);
    c.save();
    c.beginPath();
    c.arc(24, 24, 22, 0, Math.PI * 2);
    c.clip();
    const bg = c.createLinearGradient(0, 0, 0, 48);
    bg.addColorStop(0, pal.air[0]);
    bg.addColorStop(1, pal.air[1]);
    c.fillStyle = bg;
    c.fillRect(0, 0, 48, 48);
    c.fillStyle = pal.soil[0];
    c.fillRect(0, 35, 48, 13);
    c.fillStyle = pal.litter[1];
    c.fillRect(0, 35, 48, 1);

    const t = 0;
    switch (kind) {
      case 'hyphae':
        c.fillStyle = pal.soil[0];
        c.fillRect(0, 20, 48, 28);
        O.threads(c, 24, 21, 1.2, pal);
        break;
      case 'bonnet':
        O.bonnet(c, 19, 36, 18, -1.5, pal, 0);
        O.bonnet(c, 29, 36, 13, 1.5, pal, 0);
        break;
      case 'moss':
        O.moss(c, 24, 36.5, 30, pal, 4);
        break;
      case 'springtail':
        O.springtail(c, 15, 35, 1.8);
        O.springtail(c, 27, 29, 1.8);
        O.springtail(c, 34, 35, 1.8);
        break;
      case 'fern':
        O.fern(c, 24, 37, 30, pal, t, 0.5);
        break;
      case 'pillbug':
        O.pillbug(c, 22, 35.5, 2, 1, t);
        break;
      case 'snail':
        O.snail(c, 21, 35.5, 1.6, 1, t);
        break;
      case 'frog':
        O.frog(c, 22, 36, 1.8, 1, t, 0);
        break;
      case 'glowcap':
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(0, 0, 48, 35);
        O.glowcapCluster(c, 24, 36, 1.4, pal, 1000);
        break;
      case 'sundew':
        O.sundew(c, 24, 35, 1.5, t);
        break;
      case 'lichen':
        O.pixieCups(c, 24, 35.5, 1.7);
        break;
      case 'coral':
        O.coral(c, 22, 35.5, 1.6, 3);
        break;
      case 'ghostpipe':
        O.ghostPipe(c, 24, 35.5, 1.35, t);
        break;
      case 'beetle':
        O.beetle(c, 22, 35, 1.9, 1, t);
        break;
      default:
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(0, 0, 48, 48);
        c.fillStyle = 'rgba(239,230,214,0.55)';
        c.font = '600 18px Rubik, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('?', 24, 25);
    }
    c.restore();
    // Dish rim.
    c.strokeStyle = 'rgba(214,232,226,0.35)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(24, 24, 22, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath();
    c.arc(24, 24, 19.5, Math.PI * 1.05, Math.PI * 1.45);
    c.stroke();
  }
}
