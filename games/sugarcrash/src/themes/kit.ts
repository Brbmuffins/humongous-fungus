// What a theme is, and the drawing helpers the themes share. A theme is the
// look, the words and the sounds of the game: the rules, the crash math, the
// betting and the wallet never read it. Everything here is plain data and
// canvas calls, so a theme costs no files and no network.
import type { Phase } from '../game';

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const ease = (k: number): number => {
  const x = clamp(k);
  return x * x * (3 - 2 * x);
};
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** Seeded random numbers for fixed scenery. */
export function lcg(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Mix two #rrggbb colors. */
export function mix(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(lerp((x >> sh) & 255, (y >> sh) & 255, clamp(k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** A color ramp over the multiplier, evenly spaced in log(m). */
export function makeHeat(stops: readonly [number, [number, number, number]][]): (m: number) => string {
  return (m) => {
    const lm = Math.log(Math.max(1, m));
    for (let i = 1; i < stops.length; i++) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      if (m <= b) {
        const k = (lm - Math.log(a)) / (Math.log(b) - Math.log(a));
        return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(',')})`;
      }
    }
    return `rgb(${stops[stops.length - 1][1].join(',')})`;
  };
}

// ---------------------------------------------------------------------------
// Sounds a theme can pick from (sound.ts makes them).

export const CRASH_SOUNDS = ['wah', 'sizzle', 'glug', 'splat', 'pop', 'zap', 'tumble', 'honk', 'faint', 'spill', 'clack'] as const;
export type CrashSound = (typeof CRASH_SOUNDS)[number];
export const LAUNCH_SOUNDS = ['can', 'sizzle', 'whoosh', 'rattle', 'grind'] as const;
export type LaunchSound = (typeof LAUNCH_SOUNDS)[number];

export interface SoundProfile {
  /** The whine over the rush: its timbre, its pitch at 1×, and how far it climbs per doubling. */
  whine: { type: OscillatorType; base: number; slope: number };
  /** The pulse under it: the thump's pitch, beats per minute at 1×, and beats added per doubling. */
  beat: { freq: number; bpm: number; slope: number };
  launch: LaunchSound;
  /** The jingle at a milestone: a run of notes (ratios of the base) played `step` seconds apart. */
  milestone: { wave: OscillatorType; base: number; ratios: readonly number[]; step: number };
}

// ---------------------------------------------------------------------------
// What the canvas draws a theme's way.

/** The colors the shared parts of the picture (grid, line, shouts, pins) use. */
export interface Ink {
  /** r,g,b of the grid lines and axis labels (used with different alphas). */
  grid: string;
  label: string;
  /** The glow around the line, and the area under it (rising, then crashed). */
  glow: string;
  fillTop: string;
  fillBottom: string;
  crashFillTop: string;
  crashFillBottom: string;
  /** The dark edge around big text. */
  outline: string;
  /** Whether small text (labels, captions, axes) gets that edge too, for bright backdrops. */
  edge: boolean;
  /** Small captions on the picture. */
  caption: string;
  win: string;
  lose: string;
  cash: string;
  crashTitle: string;
  crashSub: string;
  /** Your pin on the line, and the crowd's. */
  pinYou: string;
  pinYouText: string;
  pinYouBg: string;
  pinBotText: string;
  pinBotBg: string;
  /** The countdown bar, left to right. */
  bar: readonly [string, string, string];
  /** r,g,b of the flash on a milestone, a cash-out and a crash. */
  flashMilestone: string;
  flashCash: string;
  flashCrash: string;
  /** The tint laid over the picture while the color drains out after a crash. */
  drain: string;
}

export type PKind = 'stick' | 'coin' | 'flutter' | 'text' | 'dot' | 'drop' | 'flame';
export type Puff = (x: number, y: number, vx: number, vy: number, kind: PKind, life: number, r: number, color: string, gravity?: number, text?: string) => void;

/** What every frame of the picture knows. */
export interface Frame {
  c: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** Milliseconds, from the animation clock. */
  now: number;
  /** Seconds since the last frame. */
  dt: number;
  phase: Phase;
  /** The multiplier at the tip: 1 before the rush, the crash point after it. */
  m: number;
  /** Which way the line is heading, in radians (up and to the right is negative). */
  dir: number;
  /** Reduced motion: keep it still. */
  calm: boolean;
  puff: Puff;
}

export interface RiderFrame extends Frame {
  /** Where the line's tip is. */
  tipX: number;
  tipY: number;
  /** Where the line starts (the launch pad). */
  padX: number;
  padY: number;
  /** The bottom and right edge of the chart. */
  floorY: number;
  rightX: number;
  /** A size unit for the rider: about 15 on a phone, 28 on a big screen. */
  s: number;
  /** Which crash it is, and how long ago it happened (seconds). */
  variant: number;
  since: number;
  /** How far the line has plunged (0 to 1), over the first half second. */
  plunge: number;
}

export interface Anchor {
  x: number;
  y: number;
}

/** A theme's live picture: its backdrop and the character on the line. One per Sky. */
export interface ThemeScene {
  /** The sky or room behind everything, and whatever streams past. */
  backdrop(f: Frame): void;
  /** The character: on the pad before the rush, riding the tip during it, and the crash after. Returns where it is. */
  rider(f: RiderFrame): Anchor;
}

export interface CrashVariant {
  /** The big shout over the picture. */
  title: string;
  /** A small line under the result. */
  caption: string;
  sound: CrashSound;
}

export interface Theme {
  id: string;
  /** Full name, and the short one for the picker. */
  name: string;
  chip: string;
  icon: string;
  /** What the picker's tooltip says. */
  blurb: string;
  /** The wordmark in the header: two parts, the second in the accent color. `icon` null draws the donut. */
  logo: readonly [string, string];
  logoIcon: string | null;
  themeColor: string;
  /** CSS custom properties for the page around the picture. */
  css: Readonly<Record<string, string>>;
  ink: Ink;
  /** What bursts when something happens: its colors, and whether it throws sticks (sprinkles) or dots (sparks, bits). */
  fx: { confetti: readonly string[]; burst: 'stick' | 'dot' };
  /** The color of the line and the big number at multiplier m. */
  heat(m: number): string;
  /** "SUGAR RUSH IN": over the countdown. */
  launchLabel: string;
  /** Shouts at each of the milestones. */
  milestones: Readonly<Record<number, string>>;
  /** The made-up gauge in the corner. */
  readout: {
    /** What it measures: SUGAR, HEAT, ALTITUDE. */
    label: string;
    /** Its number at multiplier m: climbs with m, never goes down. */
    level(m: number): number;
    /** The whole line, for that number. */
    text(level: number): string;
  };
  /** "Sugar crash", "Wipeout": the thing that ends a round, and how a bet "came to an end". */
  crashName: string;
  crashedVerb: string;
  crashes: readonly CrashVariant[];
  /** Made-up players, the same number in every theme. */
  crowd: readonly string[];
  /** Who slips you coins when you're broke. */
  refill: { who: string; quip: string; stat: string };
  help: { eyebrow: string; story: string; back: string };
  sound: SoundProfile;
  scene(): ThemeScene;
}

// ---------------------------------------------------------------------------
// Streaming scenery

export interface Flow {
  flying: boolean;
  speed: number;
  vx: number;
  vy: number;
}

/** How fast the world slides past, and which way: against the line's heading. */
export function flow(f: Frame, base = 50, gain = 110, max = 320): Flow {
  const flying = f.phase === 'flying';
  const speed = flying ? base + Math.min(max, Math.log(f.m) * gain) : 10;
  return { flying, speed, vx: flying ? -Math.cos(f.dir) * speed : -speed * 0.6, vy: flying ? -Math.sin(f.dir) * speed : speed * 0.3 };
}

export interface Flyer<K extends string> {
  kind: K;
  x: number;
  y: number;
  rot: number;
  spin: number;
  s: number;
  hue: number;
}

/** Things that stream past, more and faster as the multiplier climbs. */
export class Streamer<K extends string> {
  items: Flyer<K>[] = [];
  private next = 0;

  constructor(
    private kinds: readonly K[],
    private hues: number,
    private draw: (c: CanvasRenderingContext2D, kind: K, x: number, y: number, s: number, rot: number, hue: number) => void,
    private size = 1,
    private maxN = 14,
  ) {}

  update(f: Frame, fl: Flow): void {
    const { c, W, H, m, dt, now } = f;
    const want = fl.flying ? Math.min(this.maxN, 3 + Math.floor(Math.log2(m) * 3)) : 3;
    if (this.items.length < want && now > this.next) {
      this.next = now + (fl.flying ? Math.max(120, 700 / Math.max(1, Math.log2(m) + 1)) : 1500);
      const s = Math.max(10, Math.min(24, Math.min(W, H) * 0.045)) * (0.7 + Math.random() * 0.7) * this.size;
      // Come in from the side the scenery is heading away from.
      const len = Math.hypot(fl.vx, fl.vy) || 1;
      const ux = fl.vx / len;
      const uy = fl.vy / len;
      let x: number;
      let y: number;
      if (Math.abs(ux) > Math.abs(uy)) {
        x = ux < 0 ? W + s * 2 : -s * 2;
        y = Math.random() * H;
      } else {
        x = Math.random() * W;
        y = uy < 0 ? H + s * 2 : -s * 2;
      }
      this.items.push({ kind: pick(this.kinds), x, y, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 2, s, hue: Math.floor(Math.random() * this.hues) });
    }
    this.items = this.items.filter((it) => {
      const depth = it.s / (24 * this.size);
      it.x += fl.vx * (0.6 + depth) * dt;
      it.y += fl.vy * (0.6 + depth) * dt;
      it.rot += it.spin * dt * (fl.flying ? 1 + Math.log2(m) * 0.4 : 0.4);
      c.globalAlpha = 0.55 + depth * 0.35;
      this.draw(c, it.kind, it.x, it.y, it.s, it.rot, it.hue);
      c.globalAlpha = 1;
      return it.x > -it.s * 3 && it.x < W + it.s * 3 && it.y > -it.s * 3 && it.y < H + it.s * 3;
    });
  }
}

// ---------------------------------------------------------------------------
// Small shapes

/** A fluffy cloud centered at (x, y), about 3.2·s wide. */
export function cloud(c: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x - s * 0.9, y + s * 0.15, s * 0.55, 0, TAU);
  c.arc(x - s * 0.3, y - s * 0.2, s * 0.7, 0, TAU);
  c.arc(x + s * 0.45, y - s * 0.05, s * 0.6, 0, TAU);
  c.arc(x + s * 1.0, y + s * 0.2, s * 0.45, 0, TAU);
  c.rect(x - s * 0.9, y + s * 0.2, s * 1.9, s * 0.45);
  c.fill();
}

/** A five-point star. */
export function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/** A heart, point down, centered at (x, y), about 2·r wide. */
export function heart(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.9, y - r * 1.1, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.9, y - r * 1.1, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
  c.closePath();
}

/** Draw a word that must fit: shrinks the font until it is at most maxW wide. */
export function fitText(c: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number): number {
  let size = px;
  c.font = font(size);
  const w = c.measureText(text).width;
  if (w > maxW) {
    size = Math.max(8, Math.floor((size * maxW) / w));
    c.font = font(size);
  }
  return size;
}
