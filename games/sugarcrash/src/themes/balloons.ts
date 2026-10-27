// Grandma's Balloons: Grandma floats up on a bunch of party balloons, past
// rooftops, pigeons, a bingo blimp, planes and clouds, and on into space as
// the multiplier climbs. Her altitude is the gauge. The crash is a pigeon, a
// power line or letting go to wave; she always lands somewhere soft and silly
// (a kiddie pool, a haystack, a trampoline), so nobody is hurt.
import {
  TAU,
  clamp,
  cloud,
  ease,
  lcg,
  lerp,
  makeHeat,
  mix,
  star,
  type Anchor,
  type Frame,
  type RiderFrame,
  type Theme,
  type ThemeScene,
} from './kit';

const INK = '#1b2147';
const BALLOON = ['#ff5f7e', '#ffd24a', '#5cc8ff', '#7ee08a', '#c18bff', '#ff9b3d'];

const heat = makeHeat([
  [1, [255, 143, 177]],
  [2, [255, 215, 90]],
  [5, [123, 240, 200]],
  [10, [124, 196, 255]],
  [50, [201, 163, 255]],
]);

/** The sky at "altitude" P (screens of climbing, see `climb`): sunset, day, dusk, space. */
const SKY: readonly [number, string, string][] = [
  [0, '#2a2f6b', '#ff9a7a'],
  [1, '#2f5bc0', '#f2a98a'],
  [2.2, '#3468cc', '#5a92dc'],
  [3.6, '#2a5cc0', '#4f86d4'],
  [5, '#14307a', '#2a56ad'],
  [6.5, '#050a28', '#0f2260'],
  [8, '#020410', '#0a0f30'],
];

function skyAt(p: number): [string, string] {
  for (let i = 1; i < SKY.length; i++) {
    if (p <= SKY[i][0] || i === SKY.length - 1) {
      const [a, ta, ba] = SKY[i - 1];
      const [b, tb, bb] = SKY[i];
      const k = clamp((p - a) / (b - a));
      return [mix(ta, tb, k), mix(ba, bb, k)];
    }
  }
  return [SKY[0][1], SKY[0][2]];
}

/** How high she has climbed, in units of 0.22 screens: 1 unit at 2×, 3.5 at 10×, 7 at 100×. */
const climb = (m: number): number => (7 * Math.log2(Math.max(1, m))) / Math.log2(100);

type Kind = 'cloud' | 'bird' | 'plane' | 'banner' | 'blimp' | 'sat' | 'ufo' | 'moon' | 'ringed';
interface Thing {
  kind: Kind;
  alt: number;
  x: number;
  size: number;
  speed: number;
  ph: number;
}

function makeWorld(): Thing[] {
  const r = lcg(5);
  const w: Thing[] = [];
  for (let i = 0; i < 24; i++) w.push({ kind: 'cloud', alt: 1.6 + r() * 12.5, x: r(), size: 0.7 + r() * 0.8, speed: 4 + r() * 8, ph: r() * TAU });
  for (let i = 0; i < 14; i++) w.push({ kind: 'bird', alt: 0.9 + r() * 5.5, x: r(), size: 0.7 + r() * 0.6, speed: (r() < 0.5 ? -1 : 1) * (22 + r() * 30), ph: r() * TAU });
  for (const alt of [7.0, 8.3, 9.5]) w.push({ kind: 'plane', alt, x: r(), size: 1, speed: (r() < 0.5 ? -1 : 1) * 34, ph: 0 });
  w.push({ kind: 'banner', alt: 5.6, x: 0.35, size: 1, speed: 30, ph: 0 });
  w.push({ kind: 'blimp', alt: 3.2, x: 0.7, size: 1, speed: -10, ph: 0 });
  w.push({ kind: 'sat', alt: 8.6, x: 0.3, size: 1, speed: 10, ph: 0 }, { kind: 'sat', alt: 9.7, x: 0.75, size: 1, speed: -8, ph: 1 });
  w.push({ kind: 'ufo', alt: 10.6, x: 0.55, size: 1, speed: 14, ph: 0 });
  w.push({ kind: 'moon', alt: 12.5, x: 0.78, size: 1, speed: 0, ph: 0 });
  w.push({ kind: 'ringed', alt: 16, x: 0.25, size: 1, speed: 0, ph: 0 });
  return w;
}

function drawBird(c: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number, dark: string): void {
  c.strokeStyle = dark;
  c.lineWidth = Math.max(1.4, s * 0.12);
  c.lineCap = 'round';
  const w = s * 0.9;
  const up = Math.sin(flap) * s * 0.5;
  c.beginPath();
  c.moveTo(x - w, y - up);
  c.quadraticCurveTo(x - w * 0.4, y - up * 0.2 - s * 0.35, x, y);
  c.quadraticCurveTo(x + w * 0.4, y - up * 0.2 - s * 0.35, x + w, y - up);
  c.stroke();
}

function drawPlane(c: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number): void {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  c.strokeStyle = 'rgba(255,255,255,0.28)';
  c.lineWidth = s * 0.14;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-s * 1.1, 0);
  c.lineTo(-s * 5, s * 0.1);
  c.stroke();
  c.fillStyle = '#f4f6fb';
  c.beginPath();
  c.ellipse(0, 0, s * 1.15, s * 0.26, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#c8cfe0';
  c.beginPath();
  c.moveTo(-s * 0.2, 0);
  c.lineTo(-s * 0.7, s * 0.75);
  c.lineTo(-s * 0.35, s * 0.75);
  c.lineTo(s * 0.35, 0);
  c.closePath();
  c.fill();
  c.fillStyle = '#f4f6fb';
  c.beginPath();
  c.moveTo(-s * 0.95, -s * 0.05);
  c.lineTo(-s * 1.25, -s * 0.55);
  c.lineTo(-s * 0.9, -s * 0.5);
  c.lineTo(-s * 0.5, -s * 0.05);
  c.fill();
  c.fillStyle = '#5c7fcb';
  for (let i = 0; i < 5; i++) c.fillRect(s * (0.15 + i * 0.16), -s * 0.1, s * 0.08, s * 0.08);
  c.restore();
}

function drawBanner(c: CanvasRenderingContext2D, x: number, y: number, s: number, now: number): void {
  drawPlane(c, x, y, s * 0.8, -1);
  const bx = x + s * 1.3;
  const w = s * 6.2;
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + s * 0.9, y);
  c.lineTo(bx, y);
  c.stroke();
  c.fillStyle = '#fff6d8';
  c.beginPath();
  c.moveTo(bx, y - s * 0.55);
  for (let i = 0; i <= 8; i++) c.lineTo(bx + (w * i) / 8, y - s * 0.55 + Math.sin(now * 0.004 + i * 0.9) * s * 0.1);
  for (let i = 8; i >= 0; i--) c.lineTo(bx + (w * i) / 8, y + s * 0.55 + Math.sin(now * 0.004 + i * 0.9) * s * 0.1);
  c.closePath();
  c.fill();
  c.fillStyle = '#c0392b';
  c.font = `800 ${Math.round(s * 0.62)}px Rubik, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('IS THAT OHIO?', bx + w / 2, y + 1);
}

function drawBlimp(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.fillStyle = '#e9edf5';
  c.strokeStyle = 'rgba(27,33,71,0.5)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(x, y, s * 2.3, s * 0.95, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#d4394f';
  c.beginPath();
  c.moveTo(x - s * 2.1, y);
  c.lineTo(x - s * 3.0, y - s * 0.8);
  c.lineTo(x - s * 2.8, y + s * 0.1);
  c.lineTo(x - s * 3.0, y + s * 0.8);
  c.closePath();
  c.fill();
  c.fillStyle = '#4a5578';
  c.fillRect(x - s * 0.5, y + s * 0.85, s, s * 0.3);
  c.fillStyle = '#d4394f';
  c.font = `900 ${Math.round(s * 0.62)}px Rubik, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('BINGO TONIGHT', x, y);
}

function drawThing(c: CanvasRenderingContext2D, t: Thing, x: number, y: number, now: number, p: number, unit: number): void {
  const s = unit * t.size;
  switch (t.kind) {
    case 'cloud': {
      const a = clamp(1 - (p - 4.2) / 1.8) * 0.9;
      if (a <= 0.02) return;
      c.globalAlpha = a;
      cloud(c, x, y, s, mix('#ffd3c8', '#ffffff', clamp(p / 1.6)));
      c.globalAlpha = 1;
      break;
    }
    case 'bird':
      drawBird(c, x, y, s * 0.55, now * 0.012 + t.ph, 'rgba(25,20,50,0.75)');
      break;
    case 'plane':
      drawPlane(c, x, y, unit * 0.7, Math.sign(t.speed) || 1);
      break;
    case 'banner':
      drawBanner(c, x, y, unit * 0.55, now);
      break;
    case 'blimp':
      drawBlimp(c, x, y, unit * 0.55);
      break;
    case 'sat':
      c.save();
      c.translate(x, y);
      c.rotate(0.5 + t.ph);
      c.fillStyle = '#c9d4ee';
      c.fillRect(-unit * 0.25, -unit * 0.2, unit * 0.5, unit * 0.4);
      c.fillStyle = '#3d68c8';
      c.fillRect(-unit * 1.1, -unit * 0.1, unit * 0.75, unit * 0.2);
      c.fillRect(unit * 0.35, -unit * 0.1, unit * 0.75, unit * 0.2);
      c.restore();
      break;
    case 'ufo':
      c.fillStyle = 'rgba(160,255,200,0.2)';
      c.beginPath();
      c.moveTo(x - unit * 0.3, y + unit * 0.3);
      c.lineTo(x + unit * 0.3, y + unit * 0.3);
      c.lineTo(x + unit * 0.9, y + unit * 2.2);
      c.lineTo(x - unit * 0.9, y + unit * 2.2);
      c.fill();
      c.fillStyle = '#9fe8ff';
      c.beginPath();
      c.arc(x, y - unit * 0.1, unit * 0.4, Math.PI, 0);
      c.fill();
      c.fillStyle = '#b8c3dd';
      c.beginPath();
      c.ellipse(x, y + unit * 0.15, unit * 1.0, unit * 0.32, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#ffe45c';
      for (const d of [-0.6, 0, 0.6]) {
        c.beginPath();
        c.arc(x + d * unit, y + unit * 0.2, unit * 0.08, 0, TAU);
        c.fill();
      }
      break;
    case 'moon': {
      const r = unit * 2.4;
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#fffbe8');
      g.addColorStop(1, '#c7c2b0');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(120,115,100,0.25)';
      for (const [dx, dy, rr] of [[-0.3, -0.2, 0.25], [0.35, 0.15, 0.2], [-0.1, 0.45, 0.15]] as const) {
        c.beginPath();
        c.arc(x + dx * r, y + dy * r, rr * r, 0, TAU);
        c.fill();
      }
      break;
    }
    case 'ringed': {
      const r = unit * 3.2;
      c.fillStyle = '#e8a55c';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(255,225,170,0.8)';
      c.lineWidth = r * 0.16;
      c.beginPath();
      c.ellipse(x, y, r * 1.7, r * 0.45, -0.3, 0, TAU);
      c.stroke();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Grandma

interface Gran {
  /** Mouth and eyes. */
  face: 'happy' | 'wheee' | 'oh' | 'dazed';
  /** The right hand: up on the strings, waving bye, or down. */
  arm: 'strings' | 'wave' | 'down';
  t: number;
  /** How wired she is (the multiplier, 1 and up). */
  m: number;
  /** Hair standing on end (0 to 1) and soot on the face. */
  frizz: number;
  soot: number;
  legs: number;
}

/** Where her hand is, in her own units, so the strings can find it. */
const HAND = { x: 0.78, y: -1.15 };

/** Grandma, waist at the origin (units of s): cardigan, floral dress, glasses, a lavender bun and fuzzy slippers. */
function drawGran(c: CanvasRenderingContext2D, s: number, g: Gran): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  // Legs and slippers.
  for (const d of [-1, 1]) {
    const sw = Math.sin(g.t * 0.004 + d) * g.legs * s * 0.12;
    c.strokeStyle = INK;
    c.lineWidth = Math.max(3, s * 0.2);
    c.beginPath();
    c.moveTo(d * s * 0.22, s * 0.9);
    c.lineTo(d * s * 0.26 + sw, s * 1.5);
    c.stroke();
    c.strokeStyle = '#f0d8c0';
    c.lineWidth = Math.max(1.6, s * 0.12);
    c.stroke();
    c.fillStyle = '#ff9ccb';
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1.2, s * 0.06);
    c.beginPath();
    c.ellipse(d * s * 0.3 + sw, s * 1.55, s * 0.24, s * 0.13, 0, 0, TAU);
    c.fill();
    c.stroke();
  }
  // Dress, with flowers.
  c.fillStyle = '#7a5cc8';
  c.beginPath();
  c.moveTo(-s * 0.45, -s * 0.5);
  c.lineTo(s * 0.45, -s * 0.5);
  c.lineTo(s * 0.72, s * 1.0);
  c.lineTo(-s * 0.72, s * 1.0);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#ffd3ec';
  for (const [dx, dy] of [[-0.35, 0.55], [0.1, 0.8], [0.4, 0.4], [-0.1, 0.25]] as const) {
    c.beginPath();
    c.arc(dx * s, dy * s, s * 0.07, 0, TAU);
    c.fill();
  }
  // The cardigan.
  c.fillStyle = '#3fb0a6';
  c.beginPath();
  c.moveTo(-s * 0.5, -s * 0.55);
  c.lineTo(s * 0.5, -s * 0.55);
  c.lineTo(s * 0.58, s * 0.3);
  c.lineTo(-s * 0.58, s * 0.3);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#ffe9a8';
  for (const dy of [-0.2, 0.05]) {
    c.beginPath();
    c.arc(0, dy * s, s * 0.05, 0, TAU);
    c.fill();
  }
  // Arms.
  const wave = Math.sin(g.t * 0.012) * 0.35;
  const hand = g.arm === 'strings' ? { x: HAND.x * s, y: HAND.y * s } : g.arm === 'wave' ? { x: (0.95 + wave * 0.5) * s, y: (-1.1 - Math.abs(wave) * 0.3) * s } : { x: 0.8 * s, y: 0.3 * s };
  for (const [from, to, col] of [
    [{ x: -s * 0.45, y: -s * 0.4 }, { x: -s * 0.85, y: s * 0.35 }, '#3fb0a6'],
    [{ x: s * 0.45, y: -s * 0.4 }, hand, '#3fb0a6'],
  ] as const) {
    c.strokeStyle = INK;
    c.lineWidth = Math.max(4, s * 0.3);
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
    c.strokeStyle = col;
    c.lineWidth = Math.max(2.4, s * 0.19);
    c.stroke();
  }
  c.fillStyle = '#f6d2b4';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.2, s * 0.06);
  for (const p of [hand, { x: -s * 0.85, y: s * 0.35 }]) {
    c.beginPath();
    c.arc(p.x, p.y, s * 0.12, 0, TAU);
    c.fill();
    c.stroke();
  }
  // The handbag on her left arm.
  c.fillStyle = '#b5532c';
  c.beginPath();
  c.roundRect(-s * 1.1, s * 0.4, s * 0.5, s * 0.4, s * 0.06);
  c.fill();
  c.stroke();
  // Head.
  const hy = -s * 1.1;
  const frizz = g.frizz;
  if (frizz > 0.02) {
    c.strokeStyle = '#e6dcf5';
    c.lineWidth = Math.max(1.4, s * 0.08);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const len = s * (0.62 + frizz * 0.55 + Math.sin(i * 5 + g.t * 0.03) * 0.08);
      c.beginPath();
      c.moveTo(Math.cos(a) * s * 0.4, hy + Math.sin(a) * s * 0.4);
      c.lineTo(Math.cos(a) * len, hy + Math.sin(a) * len);
      c.stroke();
    }
  }
  c.fillStyle = '#dcd0f2';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.2, s * 0.06);
  c.beginPath();
  c.arc(0, hy - s * 0.62, s * 0.26 + frizz * s * 0.1, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = mix('#f6d2b4', '#4a3f3a', g.soot * 0.6);
  c.beginPath();
  c.ellipse(0, hy, s * 0.52, s * 0.5, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#dcd0f2';
  c.beginPath();
  c.ellipse(0, hy - s * 0.3, s * 0.54, s * 0.28, 0, Math.PI, TAU);
  c.fill();
  c.stroke();
  // Cheeks, glasses, eyes, mouth.
  c.fillStyle = `rgba(255,120,130,${0.5 * (1 - g.soot)})`;
  for (const d of [-1, 1]) {
    c.beginPath();
    c.arc(d * s * 0.33, hy + s * 0.14, s * 0.1, 0, TAU);
    c.fill();
  }
  const wide = clamp(Math.log2(g.m) / 3.3);
  for (const d of [-1, 1]) {
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath();
    c.arc(d * s * 0.22, hy - s * 0.02, s * 0.17, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = INK;
    if (g.face === 'dazed') {
      c.beginPath();
      for (let i = 0; i < 18; i++) {
        const a = g.t * 0.012 * d + i * 0.6;
        const r = (i / 18) * s * 0.13;
        if (i === 0) c.moveTo(d * s * 0.22 + Math.cos(a) * r, hy - s * 0.02 + Math.sin(a) * r);
        else c.lineTo(d * s * 0.22 + Math.cos(a) * r, hy - s * 0.02 + Math.sin(a) * r);
      }
      c.stroke();
    } else if (g.face === 'oh') {
      c.beginPath();
      c.arc(d * s * 0.22, hy - s * 0.02, s * 0.06, 0, TAU);
      c.fill();
    } else {
      c.beginPath();
      c.arc(d * s * 0.22, hy - s * 0.02, s * (0.045 + wide * 0.03), 0, TAU);
      c.fill();
    }
  }
  c.beginPath();
  c.moveTo(-s * 0.05, hy - s * 0.02);
  c.lineTo(s * 0.05, hy - s * 0.02);
  c.stroke();
  const my = hy + s * 0.3;
  c.fillStyle = '#7a1f3a';
  if (g.face === 'oh') {
    c.beginPath();
    c.ellipse(0, my, s * 0.09, s * 0.12, 0, 0, TAU);
    c.fill();
    c.stroke();
  } else if (g.face === 'wheee') {
    c.beginPath();
    c.ellipse(0, my, s * (0.14 + wide * 0.06), s * (0.07 + wide * 0.09), 0, 0, TAU);
    c.fill();
    c.stroke();
  } else if (g.face === 'dazed') {
    c.beginPath();
    c.moveTo(-s * 0.12, my + s * 0.02);
    c.quadraticCurveTo(-s * 0.04, my - s * 0.04, 0, my + s * 0.02);
    c.quadraticCurveTo(s * 0.04, my + s * 0.08, s * 0.12, my);
    c.stroke();
  } else {
    c.beginPath();
    c.arc(0, my - s * 0.06, s * 0.15, 0.2, Math.PI - 0.2);
    c.stroke();
  }
}

/** The balloons, strings meeting at the hand. Positions are in units of s from the hand. */
const BUNCH: readonly (readonly [number, number])[] = [
  [-0.85, -1.35],
  [0.0, -1.95],
  [0.85, -1.4],
  [-0.4, -2.35],
  [0.5, -2.35],
  [0.0, -1.3],
];

function drawBunch(c: CanvasRenderingContext2D, s: number, now: number, hand: { x: number; y: number }, alive: readonly boolean[], rise = 0): void {
  const sway = Math.sin(now * 0.0026) * 0.08;
  BUNCH.forEach(([dx, dy], i) => {
    if (!alive[i]) return;
    const bx = hand.x + (dx + sway * (1.4 + dy * 0.3) + Math.sin(now * 0.003 + i) * 0.05) * s;
    const by = hand.y + dy * s - rise;
    const rx = s * 0.46;
    const ry = s * 0.56;
    // String: a slack curve from the hand to the knot.
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = Math.max(1, s * 0.035);
    c.beginPath();
    c.moveTo(hand.x, hand.y - rise * (alive.length ? 0 : 0));
    c.quadraticCurveTo(hand.x + (bx - hand.x) * 0.2 + Math.sin(now * 0.004 + i) * s * 0.08, (hand.y + by + ry) / 2, bx, by + ry);
    c.stroke();
    c.fillStyle = BALLOON[i % BALLOON.length];
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1.2, s * 0.05);
    c.beginPath();
    c.ellipse(bx, by, rx, ry, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(bx - s * 0.07, by + ry);
    c.lineTo(bx + s * 0.07, by + ry);
    c.lineTo(bx, by + ry + s * 0.1);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath();
    c.ellipse(bx - rx * 0.4, by - ry * 0.4, rx * 0.2, ry * 0.3, -0.5, 0, TAU);
    c.fill();
  });
}

function drawHouse(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, shade: string, lit: boolean): void {
  c.fillStyle = shade;
  c.fillRect(x, y - h, w, h);
  c.beginPath();
  c.moveTo(x - w * 0.08, y - h);
  c.lineTo(x + w / 2, y - h - w * 0.4);
  c.lineTo(x + w * 1.08, y - h);
  c.closePath();
  c.fill();
  c.fillRect(x + w * 0.7, y - h - w * 0.45, w * 0.12, w * 0.3);
  c.fillStyle = lit ? '#ffd98a' : '#3a4270';
  c.fillRect(x + w * 0.2, y - h * 0.7, w * 0.2, h * 0.28);
  c.fillRect(x + w * 0.6, y - h * 0.7, w * 0.2, h * 0.28);
}

/** The soft place she lands. `back` is drawn behind her, `front` over her legs. */
function drawLanding(c: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, grow: number, since: number, layer: 'back' | 'front'): void {
  if (grow <= 0.01) return;
  c.save();
  c.translate(x, y);
  c.scale(grow, grow);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  if (kind === 0) {
    // A kiddie pool with a rubber duck.
    if (layer === 'back') {
      c.fillStyle = '#4aa8e8';
      c.beginPath();
      c.ellipse(0, 0, s * 2.0, s * 0.5, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.lineWidth = 1.5;
      for (const k of [0.5, 0.8]) {
        c.beginPath();
        c.ellipse(0, 0, s * 2.0 * k + Math.sin(since * 4) * 2, s * 0.5 * k, 0, 0, TAU);
        c.stroke();
      }
      c.fillStyle = '#ffd93d';
      c.beginPath();
      c.arc(s * 1.3, -s * 0.12 + Math.sin(since * 3) * 2, s * 0.22, 0, TAU);
      c.arc(s * 1.5, -s * 0.34 + Math.sin(since * 3) * 2, s * 0.14, 0, TAU);
      c.fill();
      c.fillStyle = '#ff8a1f';
      c.fillRect(s * 1.62, -s * 0.36 + Math.sin(since * 3) * 2, s * 0.14, s * 0.06);
    } else {
      c.fillStyle = 'rgba(74,168,232,0.7)';
      c.beginPath();
      c.ellipse(0, s * 0.18, s * 1.8, s * 0.36, 0, 0, Math.PI);
      c.fill();
      c.strokeStyle = '#ff5f7e';
      c.lineWidth = s * 0.2;
      c.beginPath();
      c.ellipse(0, 0, s * 2.0, s * 0.5, 0, 0.05, Math.PI - 0.05);
      c.stroke();
    }
  } else if (kind === 1) {
    // A haystack.
    if (layer === 'back') {
      c.fillStyle = '#e0b84a';
      c.beginPath();
      c.moveTo(-s * 2.0, s * 0.35);
      c.quadraticCurveTo(-s * 1.6, -s * 1.5, 0, -s * 1.6);
      c.quadraticCurveTo(s * 1.6, -s * 1.5, s * 2.0, s * 0.35);
      c.closePath();
      c.fill();
      c.stroke();
    } else {
      c.fillStyle = '#f0cc5a';
      c.beginPath();
      c.moveTo(-s * 2.1, s * 0.4);
      c.quadraticCurveTo(-s * 1.3, -s * 0.5, 0, -s * 0.35);
      c.quadraticCurveTo(s * 1.3, -s * 0.5, s * 2.1, s * 0.4);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = '#b98a1f';
      c.lineWidth = Math.max(1, s * 0.04);
      for (let i = 0; i < 14; i++) {
        const hx = -s * 1.8 + (i / 13) * s * 3.6;
        const hy = -s * 0.1 + Math.sin(i * 2.1) * s * 0.15 + Math.abs(hx) * 0.14;
        c.beginPath();
        c.moveTo(hx, hy);
        c.lineTo(hx + s * 0.25 * (i % 2 ? 1 : -1), hy + s * 0.18);
        c.stroke();
      }
    }
  } else if (layer === 'back') {
    // A trampoline.
    c.strokeStyle = INK;
    c.lineWidth = s * 0.1;
    for (const d of [-1, 1]) {
      c.beginPath();
      c.moveTo(d * s * 1.5, s * 0.05);
      c.lineTo(d * s * 1.7, s * 0.95);
      c.stroke();
    }
    c.lineWidth = Math.max(1.4, s * 0.07);
    c.fillStyle = '#2a2f6b';
    c.beginPath();
    c.ellipse(0, 0, s * 2.0, s * 0.3, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#39c28e';
    c.beginPath();
    c.ellipse(0, -s * 0.03, s * 1.75, s * 0.22, 0, 0, TAU);
    c.fill();
  }
  c.restore();
}

class BalloonsScene implements ThemeScene {
  private world = makeWorld();
  private houses: { x: number; w: number; h: number; shade: string; lit: boolean }[] = [];
  private p = 0;
  private stars: { x: number; y: number; r: number; ph: number }[] = [];
  private done = 0;
  private nextBit = 0;

  constructor() {
    const r = lcg(9);
    let x = -10;
    while (x < 900) {
      const w = 30 + r() * 30;
      this.houses.push({ x, w, h: 16 + r() * 26, shade: mix('#1c2150', '#2e2a63', r()), lit: r() < 0.6 });
      x += w + 4 + r() * 12;
    }
    for (let i = 0; i < 90; i++) this.stars.push({ x: r(), y: r(), r: 0.6 + r() * 1.3, ph: r() * TAU });
  }

  backdrop(f: Frame): void {
    const { c, W, H, now, dt } = f;
    const target = f.phase === 'betting' ? 0 : climb(f.m);
    this.p += (target - this.p) * Math.min(1, dt * (f.phase === 'flying' ? 30 : f.phase === 'betting' ? 0.9 : 0.8));
    const p = this.p;
    const unit = Math.min(H * 0.15, 52);
    const [top, bottom] = skyAt(p);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // Stars come out as the air thins.
    const starA = clamp((p - 4.3) / 2.2);
    if (starA > 0.02) {
      for (const s of this.stars) {
        c.fillStyle = `rgba(255,255,240,${starA * (0.45 + 0.4 * Math.sin(now * 0.003 + s.ph))})`;
        c.beginPath();
        c.arc(s.x * W, s.y * H, s.r, 0, TAU);
        c.fill();
      }
    }
    // The setting sun, left behind.
    const sunY = H * 0.86 - (0.8 - p * 0.55) * unit;
    if (sunY < H + 60 && p < 3) {
      const sg = c.createRadialGradient(W * 0.2, sunY, 0, W * 0.2, sunY, unit * 3);
      sg.addColorStop(0, 'rgba(255,200,120,0.55)');
      sg.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = sg;
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffd27a';
      c.beginPath();
      c.arc(W * 0.2, sunY, unit * 0.9, 0, TAU);
      c.fill();
    }
    // Things in the sky: far to near, each scrolling down as she climbs.
    for (const t of this.world) {
      const depth = t.kind === 'cloud' ? 0.85 : 1;
      const y = H * 0.9 - (t.alt - p * depth) * unit;
      if (y < -unit * 4 || y > H + unit * 3) continue;
      const span = W + unit * 14;
      const x = ((((t.x * span + now * 0.001 * t.speed) % span) + span) % span) - unit * 7;
      drawThing(c, t, x, y, now, p, unit);
    }
    // The town below.
    const gy = H * 0.9 + p * unit;
    if (gy < H + unit * 2) {
      c.fillStyle = '#161a42';
      c.fillRect(0, gy, W, H - gy + unit * 2);
      for (const h of this.houses) drawHouse(c, h.x, gy + 2, h.w, h.h, h.shade, h.lit);
    }
  }

  rider(f: RiderFrame): Anchor {
    const { c, now, phase } = f;
    const S = f.s * 1.3;
    const alive = [true, true, true, true, true, true];
    const g: Gran = { face: 'happy', arm: 'strings', t: now, m: Math.max(1, f.m), frizz: 0, soot: 0, legs: 1 };
    if (phase === 'betting') {
      // On the roof, balloons straining at their strings.
      const x = f.padX + S * 1.2;
      const y = f.padY - S * 1.55;
      c.fillStyle = '#2b2a63';
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1.4, S * 0.07);
      c.beginPath();
      c.moveTo(x - S * 2.1, f.padY + S * 0.2);
      c.lineTo(x - S * 1.5, f.padY - S * 0.1);
      c.lineTo(x + S * 1.5, f.padY - S * 0.1);
      c.lineTo(x + S * 2.1, f.padY + S * 0.2);
      c.closePath();
      c.fill();
      c.stroke();
      c.save();
      c.translate(x, y + Math.sin(now * 0.003) * S * 0.05);
      g.legs = 0.2;
      drawGran(c, S, g);
      drawBunch(c, S, now, { x: HAND.x * S, y: HAND.y * S }, alive, Math.abs(Math.sin(now * 0.002)) * S * 0.15);
      c.restore();
      return { x, y: y - S * 2 };
    }
    // Hang from the balloons, which sit above the tip.
    const x0 = f.tipX;
    const y0 = Math.max(f.tipY + S * 0.4, 14 + S * 3.9);
    if (phase === 'flying') {
      const shake = f.calm ? 0 : S * Math.min(0.05, 0.015 * Math.log2(f.m));
      const x = x0 + (Math.random() - 0.5) * shake * 2;
      const y = y0 + (Math.random() - 0.5) * shake * 2 + Math.sin(now * 0.003) * S * 0.06;
      c.save();
      c.translate(x, y);
      c.rotate(Math.sin(now * 0.0021) * 0.05 + f.dir * 0.08);
      g.face = f.m > 1.6 ? 'wheee' : 'happy';
      g.legs = 1 + Math.log2(f.m) * 0.4;
      drawGran(c, S, g);
      drawBunch(c, S, now, { x: HAND.x * S, y: HAND.y * S }, alive);
      c.restore();
      if (!f.calm && f.m > 3 && now > this.nextBit) {
        this.nextBit = now + 220;
        f.puff(x + (Math.random() - 0.5) * S * 3, y - S * 3.8, (Math.random() - 0.5) * 30, -20, 'dot', 900, 1.5 + Math.random() * 1.5, 'rgba(255,255,255,0.8)', 0);
      }
      return { x, y };
    }
    return this.crash(f, S, x0, y0, g, alive);
  }

  private crash(f: RiderFrame, S: number, x0: number, y0: number, g: Gran, alive: boolean[]): Anchor {
    const { c, now, since, variant } = f;
    if (since < 0.05) this.done = 0;
    const ly = f.floorY - S * 1.15;
    const lx = Math.min(f.rightX - S * 2.2, Math.max(S * 2.4, x0));
    const grow = ease((since - 0.25) / 0.45);
    const kind = variant;
    let x = x0;
    let y = y0;
    let rise = 0;
    let bunchAlive = alive;
    let wire = 0;
    if (variant === 0) {
      // A pigeon pops a balloon; she drifts down on the rest.
      const p = clamp((since - 0.35) / 1.4);
      y = lerp(y0, ly, ease(p));
      x = lerp(x0, lx, ease(p)) + Math.sin(since * 4) * S * 0.12 * (1 - p);
      bunchAlive = alive.map((a, i) => a && (i !== 1 || since < 0.35));
      g.face = since < 1.75 ? 'oh' : 'happy';
      if (since >= 0.35 && !(this.done & 1)) {
        this.done |= 1;
        const bx = x0 + (HAND.x + 0.0) * S;
        const by = y0 + (HAND.y - 1.95) * S;
        f.puff(bx, by, 0, 0, 'text', 900, S * 0.55, '#fff3a8', -30, 'POP!');
        for (let i = 0; i < 8; i++) f.puff(bx, by, Math.cos(i) * 120, Math.sin(i) * 120, 'flutter', 800, 3, BALLOON[1], 200);
      }
      if (p >= 1 && !(this.done & 2)) {
        this.done |= 2;
        for (let i = 0; i < (f.calm ? 4 : 18); i++) f.puff(x + (Math.random() - 0.5) * S, ly + S * 0.5, (Math.random() - 0.5) * 220, -120 - Math.random() * 160, 'drop', 900, 2.4, '#bfe6ff', 520);
      }
    } else if (variant === 1) {
      // Into a power line: zap, all the balloons gone at once, then straight down into hay.
      wire = ease(since / 0.12);
      const hit = since >= 0.12;
      bunchAlive = alive.map(() => !hit);
      const p = clamp((since - 0.6) / 0.75);
      y = lerp(y0, ly, p * p);
      x = lerp(x0, lx, p * p) + (hit && p === 0 ? (Math.random() - 0.5) * S * 0.12 : 0);
      g.face = hit ? (since < 1.3 ? 'oh' : 'dazed') : 'wheee';
      g.frizz = hit ? ease((since - 0.12) / 0.15) * (1 - ease((since - 2.0) / 0.8) * 0.5) : 0;
      g.soot = hit ? ease((since - 0.12) / 0.2) : 0;
      if (hit && !(this.done & 1)) {
        this.done |= 1;
        for (let i = 0; i < (f.calm ? 5 : 22); i++) f.puff(x0 + (Math.random() - 0.5) * S * 2, y0 - S * 3.3, (Math.random() - 0.5) * 340, (Math.random() - 0.5) * 340, 'stick', 500, 3, '#fff27a', 0);
        f.puff(x0, y0 - S * 3.3, 0, 0, 'flame', 300, S * 1.4, 'rgba(255,255,200,0.95)', 0);
        for (let i = 0; i < 12; i++) f.puff(x0 + (Math.random() - 0.5) * S * 2, y0 - S * 3.3, (Math.random() - 0.5) * 220, 40 + Math.random() * 120, 'flutter', 1200, 3, BALLOON[i % BALLOON.length], 300);
        f.puff(x0, y0 - S * 4.2, 0, -30, 'text', 900, S * 0.55, '#fff27a', 0, 'ZAP!');
      }
      if (p >= 1 && !(this.done & 2)) {
        this.done |= 2;
        for (let i = 0; i < (f.calm ? 4 : 20); i++) f.puff(x, ly + S * 0.3, (Math.random() - 0.5) * 260, -160 - Math.random() * 180, 'stick', 1100, 3.2, '#e8c24a', 520);
      }
    } else {
      // She lets go to wave goodbye; the balloons float off and she drops onto a trampoline.
      rise = ease(since / 1.8) * f.H * 1.3;
      const p = clamp((since - 0.3) / 0.85);
      const after = Math.max(0, since - 1.15);
      y = lerp(y0, ly, p * p) - (p >= 1 ? Math.abs(Math.sin(after * 6.5)) * S * 0.95 * Math.exp(-after * 2.2) : 0);
      x = lerp(x0, lx, p * p);
      g.arm = 'wave';
      g.face = 'happy';
      if (!(this.done & 1)) {
        this.done |= 1;
        f.puff(x0 + S * 1.6, y0 - S * 2.6, 20, -30, 'text', 1300, S * 0.55, '#ffffff', 0, 'BYE!');
      }
      if (p >= 1 && !(this.done & 2)) {
        this.done |= 2;
        for (let i = 0; i < (f.calm ? 3 : 10); i++) f.puff(x, ly + S * 0.5, (Math.random() - 0.5) * 160, -100 - Math.random() * 100, 'dot', 700, 2.2, '#ffe45c', 400);
      }
    }
    // The wire first, then the landing's back half, her, the balloons, the landing's front.
    if (wire > 0) {
      c.strokeStyle = '#10142c';
      c.lineWidth = 2;
      const wy = y0 - S * 3.3;
      for (const k of [-0.25, 0, 0.25]) {
        c.globalAlpha = wire;
        c.beginPath();
        c.moveTo(0, wy + k * S + 6);
        c.quadraticCurveTo(f.W / 2, wy + k * S + 14, f.W, wy + k * S + 6);
        c.stroke();
      }
      c.globalAlpha = 1;
      // The pigeon on the wire, shocked, then gone.
      if (since < 0.9) drawPigeon(c, x0 + S * 2.6, wy + 2, S * 0.45, since * 10, 1);
    }
    drawLanding(c, kind, lx, f.floorY - S * 0.3, S, grow, since, 'back');
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(since * 5) * 0.04 * (variant === 0 ? 1 - clamp((since - 0.35) / 1.4) : 0));
    g.legs = variant === 2 ? 0.2 : 1.2;
    drawGran(c, S, g);
    c.restore();
    if (bunchAlive.some(Boolean)) {
      c.save();
      c.translate(x, y);
      drawBunch(c, S, now, { x: HAND.x * S, y: HAND.y * S }, bunchAlive, rise);
      c.restore();
    }
    drawLanding(c, kind, lx, f.floorY - S * 0.3, S, grow, since, 'front');
    if (variant === 0 && since < 1.3) {
      // The pigeon: in from the right, then off again, very pleased.
      const k = clamp(since / 0.35);
      const away = clamp((since - 0.35) / 0.5);
      drawPigeon(c, lerp(x0 + S * 5.5, x0, k) + away * S * 5, lerp(y0 - S * 6, y0 + (HAND.y - 1.95) * S, k) - away * S * 3, S * 0.55, since * 22, -1);
    }
    if (variant === 1 && since > 1.35 && !f.calm) {
      // Dazed stars circling her head.
      for (let i = 0; i < 3; i++) {
        const a = since * 5 + (i * TAU) / 3;
        c.fillStyle = '#ffe45c';
        star(c, x + Math.cos(a) * S * 0.8, y - S * 1.7 + Math.sin(a) * S * 0.22, S * 0.17, a);
        c.fill();
      }
    }
    return { x, y };
  }
}

/** A plump grey pigeon, facing `dir` (1 right, -1 left). */
function drawPigeon(c: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number, dir: number): void {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.2, s * 0.08);
  c.fillStyle = '#9aa3b5';
  c.beginPath();
  c.ellipse(0, 0, s * 0.9, s * 0.6, 0, 0, TAU);
  c.fill();
  c.stroke();
  const up = Math.sin(flap) * s * 0.7;
  c.fillStyle = '#7e879b';
  c.beginPath();
  c.moveTo(-s * 0.1, -s * 0.1);
  c.quadraticCurveTo(-s * 0.7, -s * 0.5 - up, -s * 1.1, -s * 0.2 - up);
  c.quadraticCurveTo(-s * 0.6, s * 0.1, -s * 0.1, s * 0.1);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#9aa3b5';
  c.beginPath();
  c.arc(s * 0.8, -s * 0.35, s * 0.4, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#ffb347';
  c.beginPath();
  c.moveTo(s * 1.15, -s * 0.38);
  c.lineTo(s * 1.55, -s * 0.28);
  c.lineTo(s * 1.15, -s * 0.2);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(s * 0.92, -s * 0.45, s * 0.12, 0, TAU);
  c.fill();
  c.fillStyle = INK;
  c.beginPath();
  c.arc(s * 0.95, -s * 0.45, s * 0.05, 0, TAU);
  c.fill();
  c.restore();
}

export const balloons: Theme = {
  id: 'balloons',
  name: 'Grandma’s Balloons',
  chip: 'Balloons',
  icon: '🎈',
  blurb: 'Grandma floats up on a bunch of party balloons',
  logo: ['Grandma’s', 'Balloons'],
  logoIcon: '🎈',
  themeColor: '#0a1a33',
  css: {
    '--bg': '#0a1a33',
    '--bg2': '#0e2344',
    '--panel': '#12305a',
    '--panel2': '#19417a',
    '--line': '#2a5ba0',
    '--hover': '#1f4c90',
    '--text': '#f2f8ff',
    '--muted': '#a9c8ec',
    '--green': '#6dffc0',
    '--green-deep': '#1fae84',
    '--red': '#ff5470',
    '--gold': '#ffd75a',
    '--orange': '#ff9e4a',
    '--pink': '#ff6f91',
    '--lemon': '#ffe45c',
    '--glow': '124, 196, 255',
    '--stage': '#16294f',
    '--bet-hi': '#ffd0dc',
    '--bet-lo': '#f0527a',
    '--bet-edge': '#a02848',
    '--bet-ink': '#3a0716',
    '--wait-hi': '#2a5ba0',
    '--wait-lo': '#1d4580',
    '--wait-edge': '#0e2750',
    '--modal': '4, 10, 24',
  },
  ink: {
    grid: '190,215,255',
    label: '225,238,255',
    glow: 'rgba(150,200,255,0.3)',
    fillTop: 'rgba(255,111,145,0.28)',
    fillBottom: 'rgba(124,196,255,0.03)',
    crashFillTop: 'rgba(255,84,112,0.28)',
    crashFillBottom: 'rgba(255,84,112,0.02)',
    outline: 'rgba(8,16,48,0.78)',
    edge: true,
    caption: 'rgba(235,244,255,0.92)',
    win: '#6dffc0',
    lose: '#ff5470',
    cash: '#ffe45c',
    crashTitle: '#ff7f9f',
    crashSub: '#ffe0ea',
    pinYou: '#6dffc0',
    pinYouText: '#03241a',
    pinYouBg: 'rgba(30,160,120,0.95)',
    pinBotText: '#eaf4ff',
    pinBotBg: 'rgba(14,35,70,0.88)',
    bar: ['#7cc4ff', '#ffe45c', '#ff6f91'],
    flashMilestone: '255,230,140',
    flashCash: '109,255,192',
    flashCrash: '255,84,112',
    drain: '6,12,30',
  },
  fx: { confetti: BALLOON, burst: 'stick' },
  heat,
  launchLabel: 'LIFTOFF IN',
  milestones: {
    2: 'LIFTOFF',
    5: 'SEE YOU AT BINGO',
    10: 'IS THAT OHIO?',
    25: 'HI, PLANE!',
    50: 'ABOVE THE CLOUDS',
    100: 'HELLO, SPACE',
    250: 'THE MOON IS RUDE',
    500: 'KNITTING IN ORBIT',
    1000: 'STILL HOLDING ON',
  },
  readout: {
    label: 'ALTITUDE',
    level: (m) => Math.round(40 * m ** 1.5),
    text: (level) => `ALTITUDE ${level.toLocaleString('en-US')} ft`,
  },
  crashName: 'Touchdown',
  crashedVerb: 'came back down',
  crashes: [
    { title: 'POPPED', caption: 'The pigeon had opinions.', sound: 'pop' },
    { title: 'ZAPPED', caption: 'A power line. Her hair is fine.', sound: 'zap' },
    { title: 'BYE BYE!', caption: 'She let go to wave. The trampoline agrees.', sound: 'pop' },
  ],
  crowd: [
    'GrandmaGertie',
    'BingoBeryl',
    'CrochetCarol',
    'NanaNancy',
    'PeppermintPat',
    'HardCandyHelen',
    'DentureDot',
    'CardiganCarl',
    'CasseroleClara',
    'LemonDropLou',
    'WhistlingWanda',
    'MahjongMabel',
    'QuiltingQuinn',
    'BalloonBarb',
    'PigeonPaul',
    'Helium_Hal',
    'PartyPopper',
    'Cloudy_Claire',
    'HighFlyerHank',
    'LiftOffLarry',
    'MildredMileHigh',
    'AltitudeAl',
    'TetherTom',
    'StringsAttached',
    'AirHeadAmy',
    'BoomerBob',
    'BunionBea',
    'GardenGnomeGus',
    'PorchSwingPeg',
    'TeaTimeTess',
    'ShuffleboardSal',
    'SensibleShoes',
    'BridgeClubBev',
    'PotluckPam',
    'CanastaCath',
    'ColoringBookCal',
    'PuddingPatsy',
    'WindowSeatWes',
    'SkyHighSid',
    'ParasolPriscilla',
  ],
  refill: { who: 'Grandma', quip: 'Here, dear. Don’t tell your mother.', stat: 'Coins from Grandma' },
  help: {
    eyebrow: 'Hold on to your hat',
    story:
      'Grandma has a big bunch of party balloons and a lot of nerve. Every round she floats up past the rooftops, the pigeons, the planes and the clouds, and the multiplier climbs from 1.00× the higher she goes. At some point something gives. Cash out before it does and you win your bet times the multiplier. Wait too long and you get nothing but a splash.',
    back: 'Back to the sky',
  },
  sound: {
    whine: { type: 'sine', base: 440, slope: 0.5 },
    beat: { freq: 120, bpm: 60, slope: 18 },
    launch: 'whoosh',
    milestone: { wave: 'sine', base: 659, ratios: [1, 1.5, 2, 3], step: 0.07 },
  },
  scene: () => new BalloonsScene(),
};
