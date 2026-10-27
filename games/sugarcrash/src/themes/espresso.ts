// Espresso Intern: an office intern downs shot after shot of espresso at a
// desk. The wall clock spins faster, the window cycles through day and night,
// emails and sticky notes fly past, the cups pile up and the hair stands on
// end. The crash is a heart flutter and a faint, the whole pot spilled on the
// boss, or a nap face-down on the keyboard.
import {
  TAU,
  Streamer,
  clamp,
  ease,
  flow,
  heart,
  lcg,
  lerp,
  makeHeat,
  mix,
  type Anchor,
  type Frame,
  type RiderFrame,
  type Theme,
  type ThemeScene,
} from './kit';

const INK = '#241611';
const COFFEE = '#5a3220';
const SHIRT = '#bfe0ff';
const LANYARD = '#2f7cff';
const NOTE = ['#ffe45c', '#ff9ccb', '#9be8ff', '#b6f58a'];

const heat = makeHeat([
  [1, [255, 214, 170]],
  [3, [255, 176, 96]],
  [10, [255, 130, 80]],
  [30, [255, 90, 140]],
  [100, [200, 110, 255]],
]);

/** How wired: 0 groggy, 1 can hear colors. */
const wired = (m: number): number => clamp(Math.log2(Math.max(1, m)) / Math.log2(80));
/** Heartbeats a minute. */
const bpmAt = (m: number): number => Math.round(70 + 30 * Math.max(1, m) ** 0.55);

// ---------------------------------------------------------------------------
// The intern

interface Pose {
  eyes: 'sleepy' | 'wired' | 'spiral' | 'x' | 'oh';
  mouth: 'yawn' | 'grin' | 'tongue' | 'oh' | 'zig' | 'drool';
  /** Torso lean about the hips (radians, positive forward), and the head's extra tilt. */
  lean: number;
  tilt: number;
  /** The head's extra offset (units of s). */
  hx: number;
  hy: number;
  arms: 'type' | 'cup' | 'dangle' | 'up' | 'face';
  /** Hair standing up: 0 flat to 1 on end. */
  hair: number;
  sweat: number;
  t: number;
  m: number;
}

/** The intern, hips at the origin, sitting and facing right (toward the screen). */
function drawIntern(c: CanvasRenderingContext2D, s: number, p: Pose): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const lw = Math.max(1.3, s * 0.065);
  // Legs: thigh forward under the desk, shin down, shoe.
  c.strokeStyle = INK;
  c.lineWidth = Math.max(4, s * 0.34);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(s * 1.0, s * 0.05);
  c.lineTo(s * 1.0, s * 0.95);
  c.stroke();
  c.strokeStyle = '#4a5878';
  c.lineWidth = Math.max(2.4, s * 0.22);
  c.stroke();
  c.fillStyle = '#ffffff';
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.beginPath();
  c.ellipse(s * 1.2, s * 1.0, s * 0.27, s * 0.12, 0, 0, TAU);
  c.fill();
  c.stroke();
  // Torso, leaning about the hips.
  c.save();
  c.rotate(p.lean);
  c.fillStyle = SHIRT;
  c.beginPath();
  c.roundRect(-s * 0.32, -s * 1.05, s * 0.68, s * 1.1, s * 0.16);
  c.fill();
  c.stroke();
  // Lanyard and badge.
  c.strokeStyle = LANYARD;
  c.lineWidth = Math.max(1.6, s * 0.08);
  c.beginPath();
  c.moveTo(s * 0.1, -s * 1.0);
  c.lineTo(s * 0.3, -s * 0.2);
  c.stroke();
  c.fillStyle = '#ffffff';
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.fillRect(s * 0.22, -s * 0.28, s * 0.3, s * 0.34);
  c.strokeRect(s * 0.22, -s * 0.28, s * 0.3, s * 0.34);
  c.fillStyle = LANYARD;
  c.fillRect(s * 0.25, -s * 0.24, s * 0.24, s * 0.08);
  // Arms.
  const sx = s * 0.0;
  const sy = -s * 0.8;
  const buzz = p.t * 0.04;
  const wv = wired(p.m);
  const hand = (k: number): { ex: number; ey: number; hx: number; hy: number } => {
    switch (p.arms) {
      case 'type':
        return { ex: s * 0.55, ey: -s * 0.15, hx: s * (1.15 + Math.sin(buzz + k * 2) * 0.12), hy: -s * (0.22 + Math.abs(Math.sin(buzz * 1.3 + k * 3)) * 0.18 * (0.4 + wv)) };
      case 'cup':
        return { ex: s * 0.55, ey: -s * 0.35, hx: s * 0.75, hy: -s * 1.05 };
      case 'up':
        return { ex: s * (0.4 + k * 0.2), ey: -s * 1.5, hx: s * (0.3 + k * 0.5), hy: -s * 2.1 };
      case 'face':
        return { ex: s * 0.5, ey: -s * 0.8, hx: s * 0.45, hy: -s * 1.45 };
      default:
        return { ex: s * 0.2, ey: -s * 0.1, hx: s * 0.15 + k * 0.1, hy: s * 0.55 };
    }
  };
  const ghosts = p.arms === 'type' && wv > 0.2 ? 3 : 1;
  for (let g = ghosts - 1; g >= 0; g--) {
    c.globalAlpha = g === 0 ? 1 : 0.22;
    for (const k of g === 0 ? [0, 1] : [0, 1]) {
      const h = hand(k + g * 0.7);
      c.strokeStyle = INK;
      c.lineWidth = Math.max(4, s * 0.25);
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(h.ex, h.ey);
      c.lineTo(h.hx, h.hy);
      c.stroke();
      c.strokeStyle = SHIRT;
      c.lineWidth = Math.max(2.4, s * 0.15);
      c.stroke();
      c.fillStyle = '#ffd7b8';
      c.strokeStyle = INK;
      c.lineWidth = lw;
      c.beginPath();
      c.arc(h.hx, h.hy, s * 0.12, 0, TAU);
      c.fill();
      c.stroke();
      if (p.arms === 'cup' && k === 0 && g === 0) {
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(h.hx - s * 0.1, h.hy - s * 0.25);
        c.lineTo(h.hx + s * 0.18, h.hy - s * 0.25);
        c.lineTo(h.hx + s * 0.13, h.hy + s * 0.12);
        c.lineTo(h.hx - s * 0.05, h.hy + s * 0.12);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = COFFEE;
        c.fillRect(h.hx - s * 0.08, h.hy - s * 0.22, s * 0.24, s * 0.06);
      }
    }
  }
  c.globalAlpha = 1;
  c.restore();
  // Head.
  c.save();
  c.translate(s * 0.1 + p.hx * s, -s * 1.5 + p.hy * s);
  c.rotate(p.tilt);
  drawHead(c, s, p);
  c.restore();
}

function drawHead(c: CanvasRenderingContext2D, s: number, p: Pose): void {
  const lw = Math.max(1.3, s * 0.065);
  // Hair: spikes that stand up with the caffeine.
  c.fillStyle = '#4a2c1a';
  c.strokeStyle = INK;
  c.lineWidth = lw;
  const n = 9;
  const len = s * (0.12 + p.hair * 0.75);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 1.05 + (i / (n - 1)) * Math.PI * 0.9;
    const jit = Math.sin(p.t * 0.03 + i * 2.3) * s * 0.05 * p.hair;
    const bx = Math.cos(a) * s * 0.46;
    const by = Math.sin(a) * s * 0.46;
    c.beginPath();
    c.moveTo(Math.cos(a - 0.2) * s * 0.4, Math.sin(a - 0.2) * s * 0.4);
    c.lineTo(bx * (1 + len / s / 0.46 * 0.9) + jit, by * (1 + len / s / 0.46 * 0.9));
    c.lineTo(Math.cos(a + 0.2) * s * 0.4, Math.sin(a + 0.2) * s * 0.4);
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.fillStyle = '#ffd7b8';
  c.beginPath();
  c.arc(0, 0, s * 0.46, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#4a2c1a';
  c.beginPath();
  c.arc(0, -s * 0.05, s * 0.47, Math.PI * 1.0, TAU);
  c.lineTo(s * 0.47, -s * 0.2);
  c.lineTo(-s * 0.47, -s * 0.2);
  c.closePath();
  c.fill();
  c.stroke();
  // Glasses (one big round pair), profile-ish so the eyes are on the right.
  const ex = s * 0.2;
  const ey = s * 0.02;
  const er = s * (0.17 + p.hair * 0.07);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.lineWidth = Math.max(1.6, s * 0.08);
  c.beginPath();
  c.arc(ex, ey, er, 0, TAU);
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(ex - er, ey);
  c.lineTo(-s * 0.45, -s * 0.02);
  c.stroke();
  c.lineWidth = lw;
  c.fillStyle = INK;
  c.strokeStyle = INK;
  if (p.eyes === 'x') {
    c.lineWidth = Math.max(1.6, s * 0.08);
    c.beginPath();
    c.moveTo(ex - er * 0.5, ey - er * 0.5);
    c.lineTo(ex + er * 0.5, ey + er * 0.5);
    c.moveTo(ex + er * 0.5, ey - er * 0.5);
    c.lineTo(ex - er * 0.5, ey + er * 0.5);
    c.stroke();
  } else if (p.eyes === 'spiral') {
    c.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = p.t * 0.02 + i * 0.7;
      const r = (i / 20) * er * 0.85;
      const x = ex + Math.cos(a) * r;
      const y = ey + Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  } else if (p.eyes === 'sleepy') {
    c.beginPath();
    c.moveTo(ex - er, ey - er * 0.1);
    c.lineTo(ex + er, ey - er * 0.1);
    c.stroke();
    c.fillStyle = '#ffd7b8';
    c.fillRect(ex - er, ey - er, er * 2, er * 0.9);
    c.beginPath();
    c.arc(ex + er * 0.2, ey + er * 0.35, er * 0.22, 0, TAU);
    c.fillStyle = INK;
    c.fill();
  } else {
    c.beginPath();
    c.arc(ex + er * 0.15, ey, er * (p.eyes === 'oh' ? 0.3 : 0.2 + Math.abs(Math.sin(p.t * 0.05)) * 0.1), 0, TAU);
    c.fill();
    if (p.eyes === 'wired' && p.hair > 0.5) {
      // Red veins.
      c.strokeStyle = 'rgba(255,60,60,0.7)';
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.5 + 0.4;
        c.beginPath();
        c.moveTo(ex + Math.cos(a) * er * 0.4, ey + Math.sin(a) * er * 0.4);
        c.lineTo(ex + Math.cos(a) * er * 0.95, ey + Math.sin(a) * er * 0.95);
        c.stroke();
      }
    }
  }
  // Mouth.
  const mx = s * 0.22;
  const my = s * 0.3;
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.fillStyle = '#7a1230';
  if (p.mouth === 'grin') {
    c.beginPath();
    c.moveTo(mx - s * 0.12, my - s * 0.04);
    c.quadraticCurveTo(mx, my + s * 0.2, mx + s * 0.12, my - s * 0.04);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.fillRect(mx - s * 0.1, my - s * 0.03, s * 0.2, s * 0.05);
  } else if (p.mouth === 'yawn') {
    c.beginPath();
    c.ellipse(mx, my + s * 0.02, s * 0.1, s * 0.14, 0, 0, TAU);
    c.fill();
    c.stroke();
  } else if (p.mouth === 'oh') {
    c.beginPath();
    c.ellipse(mx, my, s * 0.08, s * 0.1, 0, 0, TAU);
    c.fill();
    c.stroke();
  } else if (p.mouth === 'tongue') {
    c.beginPath();
    c.moveTo(mx - s * 0.1, my);
    c.lineTo(mx + s * 0.12, my);
    c.stroke();
    c.fillStyle = '#ff7a9a';
    c.beginPath();
    c.roundRect(mx - s * 0.02, my, s * 0.14, s * 0.22, s * 0.06);
    c.fill();
    c.stroke();
  } else if (p.mouth === 'drool') {
    c.beginPath();
    c.moveTo(mx - s * 0.1, my);
    c.quadraticCurveTo(mx, my + s * 0.06, mx + s * 0.12, my - s * 0.02);
    c.stroke();
    c.fillStyle = 'rgba(190,230,255,0.9)';
    c.beginPath();
    c.ellipse(mx + s * 0.02, my + s * 0.2, s * 0.05, s * 0.12, 0, 0, TAU);
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(mx - s * 0.14, my);
    for (let i = 1; i <= 4; i++) c.lineTo(mx - s * 0.14 + i * s * 0.07, my + (i % 2 ? s * 0.05 : -s * 0.03));
    c.stroke();
  }
  // Sweat.
  if (p.sweat > 0) {
    c.fillStyle = 'rgba(160,220,255,0.9)';
    const k = (p.t * 0.0012) % 1;
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      c.ellipse(-s * 0.35 - i * s * 0.1, -s * 0.1 + ((k + i * 0.5) % 1) * s * 0.7 * p.sweat, s * 0.05, s * 0.09, 0, 0, TAU);
      c.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// The desk, and what is on it

function drawCup(c: CanvasRenderingContext2D, x: number, y: number, s: number, tilt = 0): void {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.2, s * 0.07);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(-s * 0.2, -s * 0.38);
  c.lineTo(s * 0.2, -s * 0.38);
  c.lineTo(s * 0.15, 0);
  c.lineTo(-s * 0.15, 0);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#2f7cff';
  c.fillRect(-s * 0.18, -s * 0.24, s * 0.36, s * 0.07);
  c.restore();
}

function drawLaptop(c: CanvasRenderingContext2D, x: number, y: number, s: number, now: number, m: number, mode: 'work' | 'jjj' | 'off', since = 0): void {
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.3, s * 0.07);
  // Base, then the screen, which faces us.
  c.fillStyle = '#c9ced8';
  c.beginPath();
  c.roundRect(x - s * 0.1, y - s * 0.14, s * 2.5, s * 0.14, s * 0.04);
  c.fill();
  c.stroke();
  c.fillStyle = '#aab1c0';
  c.beginPath();
  c.roundRect(x + s * 0.2, y - s * 1.75, s * 1.9, s * 1.6, s * 0.08);
  c.fill();
  c.stroke();
  const sx = x + s * 0.3;
  const sy = y - s * 1.65;
  const sw = s * 1.7;
  const sh = s * 1.4;
  c.fillStyle = mode === 'off' ? '#1d2438' : '#f4f8ff';
  c.fillRect(sx, sy, sw, sh);
  if (mode === 'jjj') {
    c.fillStyle = '#1d2438';
    c.font = `700 ${Math.max(5, Math.round(s * 0.2))}px 'IBM Plex Mono', monospace`;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    const rows = Math.min(6, 1 + Math.floor(since * 6));
    for (let r = 0; r < rows; r++) c.fillText('jjjjjjjj', sx + s * 0.1, sy + s * (0.1 + r * 0.2));
  } else if (mode === 'work') {
    // A spreadsheet of bars racing by, and the unread badge.
    const sp = (1 + Math.log2(Math.max(1, m)) * 2) * 0.002;
    for (let r = 0; r < 8; r++) {
      const w = (0.3 + ((Math.sin(r * 3.1 + now * sp) + 1) / 2) * 0.9) * sw * 0.8;
      c.fillStyle = r % 3 === 0 ? '#ff9ccb' : r % 3 === 1 ? '#9be8ff' : '#b6f58a';
      c.fillRect(sx + s * 0.1, sy + s * (0.45 + r * 0.115), w, s * 0.07);
    }
    c.fillStyle = '#d8e6ff';
    c.fillRect(sx, sy, sw, s * 0.3);
    c.fillStyle = '#ff3b4a';
    c.beginPath();
    c.arc(sx + sw - s * 0.2, sy + s * 0.15, s * 0.14, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = `800 ${Math.max(6, Math.round(s * 0.15))}px Rubik, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(m > 6 ? '99+' : '9', sx + sw - s * 0.2, sy + s * 0.16);
  }
}

function drawDesk(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  c.fillStyle = '#b07a4a';
  c.beginPath();
  c.roundRect(x - s * 2.0, y, s * 5.2, s * 0.24, s * 0.05);
  c.fill();
  c.stroke();
  c.fillStyle = '#8a5a35';
  c.fillRect(x + s * 2.7, y + s * 0.24, s * 0.4, s * 1.6);
  c.strokeRect(x + s * 2.7, y + s * 0.24, s * 0.4, s * 1.6);
  c.fillRect(x - s * 1.9, y + s * 0.24, s * 0.4, s * 1.6);
  c.strokeRect(x - s * 1.9, y + s * 0.24, s * 0.4, s * 1.6);
}

function drawChair(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  // x, y: the seat's back edge (the hips sit just in front).
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.fillStyle = '#3a4560';
  c.lineWidth = Math.max(1.4, s * 0.07);
  c.beginPath();
  c.roundRect(x - s * 0.5, y - s * 2.3, s * 0.3, s * 2.2, s * 0.14);
  c.fill();
  c.stroke();
  c.beginPath();
  c.roundRect(x - s * 0.5, y - s * 0.2, s * 1.9, s * 0.3, s * 0.12);
  c.fill();
  c.stroke();
  c.strokeStyle = '#7d8aa8';
  c.lineWidth = Math.max(2.4, s * 0.12);
  c.beginPath();
  c.moveTo(x + s * 0.4, y + s * 0.1);
  c.lineTo(x + s * 0.4, y + s * 1.35);
  c.moveTo(x - s * 0.3, y + s * 1.45);
  c.lineTo(x + s * 1.1, y + s * 1.45);
  c.stroke();
}

function drawBoss(c: CanvasRenderingContext2D, x: number, y: number, s: number, mood: 'smug' | 'shock' | 'mad', stain: number, now: number): void {
  c.save();
  c.translate(x, y);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  // Legs and shoes.
  for (const d of [-1, 1]) {
    c.fillStyle = '#3b4252';
    c.fillRect(d * s * 0.2 - s * 0.15, -s * 1.6, s * 0.3, s * 1.5);
    c.strokeRect(d * s * 0.2 - s * 0.15, -s * 1.6, s * 0.3, s * 1.5);
    c.fillStyle = '#1b1b1b';
    c.beginPath();
    c.ellipse(d * s * 0.2 + s * 0.12, -s * 0.06, s * 0.28, s * 0.12, 0, 0, TAU);
    c.fill();
  }
  // Jacket, shirt and tie.
  c.fillStyle = '#4a5468';
  c.beginPath();
  c.roundRect(-s * 0.55, -s * 3.0, s * 1.1, s * 1.6, s * 0.18);
  c.fill();
  c.stroke();
  c.fillStyle = '#f4f4ee';
  c.beginPath();
  c.moveTo(-s * 0.18, -s * 3.0);
  c.lineTo(s * 0.18, -s * 3.0);
  c.lineTo(s * 0.12, -s * 1.5);
  c.lineTo(-s * 0.12, -s * 1.5);
  c.closePath();
  c.fill();
  c.fillStyle = '#d6303f';
  c.beginPath();
  c.moveTo(0, -s * 2.95);
  c.lineTo(s * 0.1, -s * 2.0);
  c.lineTo(0, -s * 1.75);
  c.lineTo(-s * 0.1, -s * 2.0);
  c.closePath();
  c.fill();
  if (stain > 0) {
    c.fillStyle = `rgba(90,50,32,${0.9 * stain})`;
    c.beginPath();
    c.ellipse(s * 0.1, -s * 2.4, s * 0.62 * stain, s * 0.8 * stain, 0.2, 0, TAU);
    c.fill();
    c.fillRect(s * 0.0, -s * 1.6, s * 0.1, s * 0.7 * stain);
  }
  // Arms.
  c.strokeStyle = INK;
  c.lineWidth = Math.max(4, s * 0.28);
  for (const d of [-1, 1]) {
    c.beginPath();
    c.moveTo(d * s * 0.5, -s * 2.8);
    c.lineTo(d * s * (mood === 'mad' ? 0.95 : 0.7), mood === 'mad' ? -s * 3.2 : -s * 1.9);
    c.stroke();
  }
  c.strokeStyle = '#4a5468';
  c.lineWidth = Math.max(2.4, s * 0.18);
  for (const d of [-1, 1]) {
    c.beginPath();
    c.moveTo(d * s * 0.5, -s * 2.8);
    c.lineTo(d * s * (mood === 'mad' ? 0.95 : 0.7), mood === 'mad' ? -s * 3.2 : -s * 1.9);
    c.stroke();
  }
  // Head: bald with a comb-over and a mustache.
  const hy = -s * 3.5;
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  c.fillStyle = mood === 'mad' ? mix('#ffd7b8', '#ff5a4a', 0.7 + Math.sin(now * 0.02) * 0.1) : '#ffd7b8';
  c.beginPath();
  c.ellipse(0, hy, s * 0.5, s * 0.55, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.strokeStyle = '#6a6a6a';
  c.lineWidth = Math.max(1, s * 0.05);
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(-s * 0.4, hy - s * 0.3 + i * 0.03 * s);
    c.quadraticCurveTo(0, hy - s * 0.7 - i * 0.03 * s, s * 0.4, hy - s * 0.35);
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.2, s * 0.06);
  for (const d of [-1, 1]) {
    c.beginPath();
    c.arc(d * s * 0.2, hy - s * 0.05, s * (mood === 'shock' ? 0.16 : 0.12), 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(d * s * 0.2, hy - s * 0.05, s * 0.04, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.95)';
  }
  if (mood === 'mad') {
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1.6, s * 0.09);
    c.beginPath();
    c.moveTo(-s * 0.38, hy - s * 0.3);
    c.lineTo(-s * 0.05, hy - s * 0.15);
    c.moveTo(s * 0.38, hy - s * 0.3);
    c.lineTo(s * 0.05, hy - s * 0.15);
    c.stroke();
  }
  c.fillStyle = '#3b2a22';
  c.beginPath();
  c.ellipse(0, hy + s * 0.22, s * 0.3, s * 0.1, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#7a1230';
  c.beginPath();
  c.ellipse(0, hy + s * 0.4, s * (mood === 'smug' ? 0.08 : 0.14), s * (mood === 'smug' ? 0.04 : 0.12), 0, 0, TAU);
  c.fill();
  c.restore();
}

function drawPot(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, liquid: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.3, s * 0.07);
  c.fillStyle = 'rgba(210,235,255,0.85)';
  c.beginPath();
  c.moveTo(-s * 0.3, -s * 0.7);
  c.lineTo(s * 0.3, -s * 0.7);
  c.lineTo(s * 0.4, 0);
  c.lineTo(-s * 0.4, 0);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = COFFEE;
  c.fillRect(-s * 0.35, -s * 0.7 * liquid, s * 0.7, s * 0.7 * liquid);
  c.strokeStyle = INK;
  c.lineWidth = Math.max(2, s * 0.1);
  c.beginPath();
  c.arc(s * 0.38, -s * 0.35, s * 0.2, -Math.PI / 2, Math.PI / 2);
  c.stroke();
  c.fillStyle = '#222';
  c.fillRect(-s * 0.34, -s * 0.8, s * 0.68, s * 0.12);
  c.restore();
}

// ---------------------------------------------------------------------------

type Junk = 'mail' | 'note' | 'cup' | 'plane';

function drawJunk(c: CanvasRenderingContext2D, kind: Junk, x: number, y: number, s: number, rot: number, hue: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1, s * 0.09);
  if (kind === 'mail') {
    c.fillStyle = '#fffdf4';
    c.fillRect(-s * 0.7, -s * 0.5, s * 1.4, s * 1.0);
    c.strokeRect(-s * 0.7, -s * 0.5, s * 1.4, s * 1.0);
    c.beginPath();
    c.moveTo(-s * 0.7, -s * 0.5);
    c.lineTo(0, s * 0.1);
    c.lineTo(s * 0.7, -s * 0.5);
    c.stroke();
    c.fillStyle = '#ff3b4a';
    c.beginPath();
    c.arc(s * 0.65, -s * 0.5, s * 0.22, 0, TAU);
    c.fill();
  } else if (kind === 'note') {
    c.fillStyle = NOTE[hue % NOTE.length];
    c.fillRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1);
    c.strokeRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1);
    c.strokeStyle = 'rgba(36,22,17,0.5)';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(-s * 0.35, -s * 0.2 + i * s * 0.3);
      c.lineTo(s * 0.35, -s * 0.2 + i * s * 0.3);
      c.stroke();
    }
  } else if (kind === 'cup') {
    drawCup(c, 0, s * 0.3, s * 1.4);
  } else {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(-s * 0.8, 0);
    c.lineTo(s * 0.9, -s * 0.4);
    c.lineTo(s * 0.2, s * 0.1);
    c.lineTo(s * 0.4, s * 0.5);
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.restore();
}

function drawClock(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  c.fillStyle = '#fffdf4';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(2, r * 0.12);
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.stroke();
  c.lineWidth = Math.max(1, r * 0.06);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82);
    c.lineTo(x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94);
    c.stroke();
  }
  c.lineCap = 'round';
  const hr = (t / 12) * TAU - Math.PI / 2;
  const mn = t * TAU - Math.PI / 2;
  c.lineWidth = Math.max(2, r * 0.12);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + Math.cos(hr) * r * 0.5, y + Math.sin(hr) * r * 0.5);
  c.stroke();
  c.lineWidth = Math.max(1.4, r * 0.08);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + Math.cos(mn) * r * 0.78, y + Math.sin(mn) * r * 0.78);
  c.stroke();
}

class EspressoScene implements ThemeScene {
  private junk = new Streamer<Junk>(['mail', 'mail', 'note', 'cup', 'plane', 'note'], 4, drawJunk, 1, 14);
  private day = 0.25;
  private clock = 9;
  private done = 0;
  private skyline: { x: number; w: number; h: number }[] = [];
  private nextSweat = 0;

  constructor() {
    const r = lcg(17);
    let x = 0;
    while (x < 200) {
      const w = 10 + r() * 14;
      this.skyline.push({ x, w, h: 12 + r() * 38 });
      x += w + 1;
    }
  }

  backdrop(f: Frame): void {
    const { c, W, H, now, dt, m } = f;
    const wv = f.phase === 'betting' ? 0 : wired(m);
    const sp = f.phase === 'flying' ? 0.004 + wv * 0.35 : f.phase === 'betting' ? 0.002 : 0;
    this.day = (this.day + sp * dt) % 1;
    this.clock += sp * dt * 60 * (f.phase === 'flying' ? 1 : 0.2);
    // The wall: sleepy beige to electric.
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix('#e4dccb', '#ffd2f0', wv * 0.8));
    g.addColorStop(1, mix('#cdc3ae', '#ffb980', wv * 0.8));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const u = Math.max(10, Math.min(30, H * 0.07));
    // Window with a day-and-night sky and a skyline.
    const wx = W * 0.07;
    const wy = H * 0.1;
    const ww = Math.min(W * 0.34, u * 9);
    const wh = Math.min(H * 0.4, u * 6.4);
    const a = this.day * TAU;
    const light = clamp(0.5 + Math.sin(a - Math.PI / 2) * 0.7, 0, 1);
    c.save();
    c.beginPath();
    c.rect(wx, wy, ww, wh);
    c.clip();
    const sg = c.createLinearGradient(0, wy, 0, wy + wh);
    sg.addColorStop(0, mix('#0a1030', '#4aa8ff', light));
    sg.addColorStop(1, mix('#2b2a60', '#c8ecff', light));
    c.fillStyle = sg;
    c.fillRect(wx, wy, ww, wh);
    const cxs = wx + ww / 2 + Math.cos(a - Math.PI / 2) * ww * 0.6;
    const cys = wy + wh * 0.9 - Math.sin(a - Math.PI / 2) * wh * 0.8;
    c.fillStyle = light > 0.4 ? '#fff4a8' : '#f4f0e0';
    c.beginPath();
    c.arc(cxs, cys, u * 0.6, 0, TAU);
    c.fill();
    c.fillStyle = mix('#1b2145', '#5d6e94', light);
    for (const b of this.skyline) {
      if (b.x * 0.75 > ww) break;
      c.fillRect(wx + b.x * 0.75, wy + wh - b.h * (wh / 60), b.w * 0.75, b.h * (wh / 60));
    }
    c.restore();
    c.strokeStyle = '#fffdf4';
    c.lineWidth = Math.max(3, u * 0.25);
    c.strokeRect(wx, wy, ww, wh);
    c.beginPath();
    c.moveTo(wx + ww / 2, wy);
    c.lineTo(wx + ww / 2, wy + wh);
    c.stroke();
    // The clock, with hands that lose track of time.
    drawClock(c, W * 0.9, H * 0.2, Math.min(u * 1.5, W * 0.07), this.clock);
    // A motivational poster.
    const px = W * 0.55;
    const py = H * 0.1;
    c.fillStyle = '#fffdf4';
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.fillRect(px, py, u * 3.2, u * 4.0);
    c.strokeRect(px, py, u * 3.2, u * 4.0);
    c.fillStyle = mix('#8fd0ff', '#ff8ad8', wv);
    c.fillRect(px + u * 0.2, py + u * 0.2, u * 2.8, u * 2.5);
    c.fillStyle = INK;
    c.font = `900 ${Math.max(6, Math.round(u * 0.34))}px Rubik, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SYNERGY', px + u * 1.6, py + u * 3.15);
    c.font = `700 ${Math.max(5, Math.round(u * 0.2))}px Rubik, sans-serif`;
    c.fillText('(hang in there)', px + u * 1.6, py + u * 3.6);
    // A cubicle wall across the bottom.
    c.fillStyle = mix('#5f7fa8', '#7a5fc8', wv * 0.6);
    c.fillRect(0, H * 0.74, W, H * 0.26);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(0, H * 0.74, W, 4);
    // Whatever is flying around.
    this.junk.update(f, flow(f, 40, 140, 360));
    // Fluorescent flicker.
    if (!f.calm && wv > 0.2 && Math.sin(now * 0.05) > 0.96) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(0, 0, W, H);
    }
  }

  rider(f: RiderFrame): Anchor {
    const { now, phase } = f;
    const S = f.s * 1.5;
    const cxMin = S * 4.4;
    const cxMax = Math.max(cxMin, f.rightX - S * 5.4);
    const wv = wired(f.m);
    const pose: Pose = { eyes: 'wired', mouth: 'grin', lean: 0, tilt: 0, hx: 0, hy: 0, arms: 'type', hair: wv, sweat: wv > 0.4 ? 1 : 0, t: now, m: Math.max(1, f.m) };
    if (phase === 'betting') {
      const cx = clamp(f.padX + S * 2, cxMin, cxMax);
      const cy = clamp(f.padY - S * 0.2, S * 3.2, f.floorY - S * 1.6);
      pose.eyes = 'sleepy';
      pose.mouth = Math.sin(now * 0.0012) > 0.5 ? 'yawn' : 'drool';
      pose.mouth = Math.sin(now * 0.0012) > 0.3 ? 'yawn' : 'oh';
      pose.lean = 0.18;
      pose.hy = 0.12;
      pose.hair = 0;
      pose.sweat = 0;
      pose.arms = 'dangle';
      this.stage(f, S, cx, cy, pose, 'off', 1);
      return { x: cx, y: cy - S * 2 };
    }
    const cx = clamp(f.tipX, cxMin, cxMax);
    const cy = clamp(f.tipY + S * 0.9, S * 3.4, f.floorY - S * 1.6);
    if (phase === 'flying') {
      const jit = f.calm ? 0 : Math.min(S * 0.06, S * 0.02 * Math.log2(f.m + 1));
      const x = cx + (Math.random() - 0.5) * jit * 2;
      const y = cy + (Math.random() - 0.5) * jit * 2;
      pose.arms = Math.sin(now * 0.0021) > 0.88 ? 'cup' : 'type';
      pose.eyes = f.m > 25 ? 'spiral' : 'wired';
      pose.mouth = f.m > 8 ? 'zig' : 'grin';
      this.stage(f, S, x, y, pose, 'work', Math.floor(Math.log2(f.m) * 2));
      if (!f.calm && f.m > 4 && now > this.nextSweat) {
        this.nextSweat = now + 260;
        f.puff(x - S * 0.9, y - S * 2.6, (Math.random() - 0.5) * 60, -50, 'drop', 700, 2, '#a8dcff', 200);
      }
      return { x, y: y - S * 2 };
    }
    return this.crash(f, S, cx, cy, pose);
  }

  /** Chair, intern, desk, laptop, cups. */
  private stage(f: RiderFrame, S: number, cx: number, cy: number, pose: Pose, screen: 'work' | 'jjj' | 'off', cups: number, extra?: { laptopSince?: number; skipIntern?: boolean }): void {
    const c = f.c;
    const hipX = cx - S * 1.2;
    const hipY = cy + S * 0.55;
    drawChair(c, hipX - S * 0.2, hipY + S * 0.1, S);
    if (!extra?.skipIntern) {
      c.save();
      c.translate(hipX, hipY);
      drawIntern(c, S, pose);
      c.restore();
    }
    drawDesk(c, cx, cy, S);
    drawLaptop(c, cx - S * 0.1, cy, S * 0.8, f.now, f.m, screen === 'jjj' ? 'jjj' : screen, extra?.laptopSince ?? 0);
    const n = Math.min(10, Math.max(1, cups));
    for (let i = 0; i < n; i++) {
      const row = i < 5 ? 0 : 1;
      const col = row === 0 ? i : i - 5;
      drawCup(c, cx + S * (1.95 + col * 0.26 + row * 0.13), cy - row * S * 0.38, S * 0.9, (i % 3 - 1) * 0.08);
    }
  }

  private crash(f: RiderFrame, S: number, cx: number, cy0: number, pose: Pose): Anchor {
    const { c, now, variant } = f;
    // The desk falls with the line, and the act starts once it lands.
    const since = Math.max(0, f.since - 0.4);
    const cy = lerp(cy0, Math.max(cy0, f.floorY - S * 1.9), ease(f.plunge));
    if (since < 0.05) this.done = 0;
    const hipX = cx - S * 1.2;
    const hipY = cy + S * 0.55;
    pose.hair = 1;
    pose.sweat = 1;
    const once = (bit: number, fn: () => void): void => {
      if (!(this.done & bit)) {
        this.done |= bit;
        fn();
      }
    };
    if (variant === 0) {
      // The heart flutters, then flies out of the chest on little wings; he slumps back with an ECG going flat.
      const flat = since > 1.0;
      pose.eyes = since < 0.45 ? 'spiral' : 'x';
      pose.mouth = since < 0.45 ? 'oh' : 'tongue';
      pose.arms = 'dangle';
      pose.lean = -0.4 * ease((since - 0.3) / 0.5);
      pose.tilt = -0.5 * ease((since - 0.3) / 0.6);
      pose.hx = -0.15 * ease((since - 0.3) / 0.5);
      pose.hy = 0.1 * ease((since - 0.3) / 0.5);
      this.stage(f, S, cx, cy, pose, 'off', 10);
      // ECG monitor above the desk, left.
      const mx = cx - S * 4.0;
      const my = cy - S * 4.4;
      const mw = S * 2.8;
      const mh = S * 1.4;
      c.fillStyle = '#0c1a14';
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1.4, S * 0.07);
      c.beginPath();
      c.roundRect(mx, my, mw, mh, S * 0.1);
      c.fill();
      c.stroke();
      c.strokeStyle = flat ? '#ff5a4a' : '#5cff9a';
      c.lineWidth = Math.max(1.4, S * 0.07);
      c.beginPath();
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const tt = since - (1 - k) * 0.9;
        const x = mx + S * 0.1 + k * (mw - S * 0.2);
        let y = my + mh * 0.5;
        if (tt < 0) y += 0;
        else if (tt < 0.5) y -= Math.max(0, Math.sin(tt * 36)) * mh * 0.32 * (tt < 0.5 ? 1 : 0);
        else if (tt < 1.0) y += Math.sin(tt * 90) * mh * 0.1;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      once(1, () => {
        f.puff(cx - S * 1.0, cy - S * 1.4, 0, -60, 'text', 1400, S * 0.5, '#ff6a8a', 0, f.calm ? '♥' : 'beep beep…');
      });
      // The winged heart escapes.
      if (since > 0.45 && !f.calm) {
        const k = clamp((since - 0.45) / 1.6);
        const hx = cx - S * 0.9 + Math.sin(since * 6) * S * 0.2;
        const hy = cy - S * 1.3 - k * S * 2.4;
        c.fillStyle = '#ff3b6a';
        c.strokeStyle = INK;
        c.lineWidth = Math.max(1.3, S * 0.07);
        heart(c, hx, hy, S * 0.38);
        c.fill();
        c.stroke();
        c.fillStyle = '#ffffff';
        const flap = Math.sin(since * 30) * 0.5;
        for (const d of [-1, 1]) {
          c.save();
          c.translate(hx + d * S * 0.3, hy - S * 0.05);
          c.rotate(d * (0.5 + flap));
          c.beginPath();
          c.ellipse(d * S * 0.2, 0, S * 0.24, S * 0.1, 0, 0, TAU);
          c.fill();
          c.stroke();
          c.restore();
        }
      }
      return { x: hipX, y: hipY - S * 2 };
    }
    if (variant === 1) {
      // The boss walks in; the pot flies; coffee everywhere.
      const floorY = cy + S * 1.4 + S * 1.45;
      const walk = ease(since / 0.5);
      const bx = lerp(cx + S * 7.5, cx + S * 4.2, walk);
      const potT = clamp((since - 0.55) / 0.5);
      const hit = potT >= 1;
      const stain = hit ? ease((since - 1.05) / 0.4) : 0;
      pose.arms = since > 0.5 && !hit ? 'up' : 'face';
      pose.eyes = 'oh';
      pose.mouth = hit ? 'zig' : 'oh';
      pose.sweat = 1;
      this.stage(f, S, cx, cy, pose, 'off', 10);
      drawBoss(c, bx, floorY, S * 0.92, hit ? (since > 1.7 ? 'mad' : 'shock') : 'smug', stain, now);
      if (since > 0.45 && !hit) {
        const px = lerp(cx + S * 2.0, bx - S * 0.2, potT);
        const py = lerp(cy - S * 0.8, floorY - S * 2.8, potT) - Math.sin(potT * Math.PI) * S * 2.4;
        drawPot(c, px, py, S * 0.9, potT * 6, 1 - potT * 0.5);
        if (!f.calm && now % 3 < 1) f.puff(px, py - S * 0.5, (Math.random() - 0.5) * 60, -30, 'drop', 500, 2.4, COFFEE, 400);
      }
      once(1, () => f.puff(cx, cy - S * 3.4, 0, -40, 'text', 1100, S * 0.5, '#fff3a8', 0, 'OOPS'));
      if (hit) {
        once(2, () => {
          for (let i = 0; i < (f.calm ? 5 : 26); i++) f.puff(bx, floorY - S * 2.6, (Math.random() - 0.5) * 300, -60 - Math.random() * 220, 'drop', 900, 3, COFFEE, 520);
          f.puff(bx, floorY - S * 4.4, 0, -30, 'text', 1400, S * 0.5, '#ffb3a8', 0, 'SMITHERS!');
        });
        if (!f.calm && since > 1.7 && Math.floor(now / 90) % 3 === 0) f.puff(bx + (Math.random() - 0.5) * S, floorY - S * 4.3, (Math.random() - 0.5) * 30, -70, 'dot', 700, 3, 'rgba(255,255,255,0.7)', -20);
      }
      return { x: hipX, y: hipY - S * 2 };
    }
    // Nap on the keyboard.
    const d = ease(since / 0.7);
    pose.arms = 'dangle';
    pose.eyes = 'sleepy';
    pose.mouth = 'drool';
    pose.lean = 0.95 * d;
    pose.tilt = 1.2 * d;
    pose.hx = 0.95 * d;
    pose.hy = 0.5 * d;
    pose.hair = 1 - 0.7 * d;
    pose.sweat = 0;
    this.stage(f, S, cx, cy, pose, 'jjj', 10, { laptopSince: Math.max(0, since - 0.6) * 0.6 });
    // A sticky note on the back of the head.
    if (since > 0.9) {
      c.save();
      c.translate(hipX + S * 1.35, cy - S * 0.55);
      c.rotate(0.2);
      drawJunk(c, 'note', 0, 0, S * 0.45, 0, 0);
      c.restore();
    }
    if (!f.calm && since > 0.8 && Math.floor(since * 2.2) !== Math.floor((since - f.dt) * 2.2)) {
      f.puff(hipX + S * 1.6, cy - S * 1.9, 20, -45, 'text', 1500, S * 0.4, '#d8e6ff', 0, 'Z');
    }
    once(1, () => f.puff(hipX + S * 1.6, cy - S * 3.2, 0, -30, 'text', 1300, S * 0.5, '#d8e6ff', 0, f.calm ? 'zzz' : 'zzZZ'));
    return { x: hipX, y: hipY - S * 2 };
  }
}

export const espresso: Theme = {
  id: 'espresso',
  name: 'Espresso Intern',
  chip: 'Intern',
  icon: '☕',
  blurb: 'An office intern, one shot too many',
  logo: ['Espresso', 'Intern'],
  logoIcon: '☕',
  themeColor: '#1b1210',
  css: {
    '--bg': '#1b1210',
    '--bg2': '#241815',
    '--panel': '#33231d',
    '--panel2': '#432f27',
    '--line': '#6a4a3c',
    '--hover': '#533b31',
    '--text': '#fff4ea',
    '--muted': '#d4b7a5',
    '--green': '#8bffc4',
    '--green-deep': '#27b383',
    '--red': '#ff5a5a',
    '--gold': '#ffd23c',
    '--orange': '#ff9a4a',
    '--pink': '#ff8ab8',
    '--lemon': '#ffe45c',
    '--glow': '255, 170, 110',
    '--stage': '#2b1d18',
    '--bet-hi': '#cfe4ff',
    '--bet-lo': '#4f93f0',
    '--bet-edge': '#2a5ba8',
    '--bet-ink': '#06213f',
    '--wait-hi': '#6a4a3c',
    '--wait-lo': '#533b31',
    '--wait-edge': '#2b1d18',
    '--modal': '18, 10, 8',
  },
  ink: {
    grid: '255,226,200',
    label: '255,238,224',
    glow: 'rgba(255,170,100,0.3)',
    fillTop: 'rgba(255,160,100,0.3)',
    fillBottom: 'rgba(255,160,100,0.03)',
    crashFillTop: 'rgba(255,90,90,0.28)',
    crashFillBottom: 'rgba(255,90,90,0.02)',
    outline: 'rgba(36,22,17,0.82)',
    edge: true,
    caption: 'rgba(255,244,234,0.92)',
    win: '#8bffc4',
    lose: '#ff5a5a',
    cash: '#ffe45c',
    crashTitle: '#ff8a7a',
    crashSub: '#ffe6dc',
    pinYou: '#8bffc4',
    pinYouText: '#052a1a',
    pinYouBg: 'rgba(36,170,120,0.95)',
    pinBotText: '#fff0e4',
    pinBotBg: 'rgba(50,32,26,0.9)',
    bar: ['#ffcf9a', '#ffe45c', '#ff8a5a'],
    flashMilestone: '255,225,160',
    flashCash: '139,255,196',
    flashCrash: '255,90,90',
    drain: '24,12,8',
  },
  fx: { confetti: ['#ffe45c', '#ff9ccb', '#9be8ff', '#b6f58a', '#ffffff'], burst: 'dot' },
  heat,
  launchLabel: 'FIRST SHOT IN',
  milestones: {
    2: 'PRODUCTIVE',
    5: 'I CAN HEAR COLORS',
    10: 'I REPLIED-ALL',
    25: 'EMAILED THE CEO A POEM',
    50: 'TIME IS A FLAT CIRCLE',
    100: 'REORGANIZED THE FILING CABINET',
    250: 'I AM THE SYNERGY',
    500: 'PROMOTED TO WEATHER',
    1000: 'BEYOND DECAF',
  },
  readout: {
    label: 'HEART RATE',
    level: (m) => bpmAt(m),
    text: (level) => `${Math.floor((level - 70) / 30).toLocaleString('en-US')} SHOTS · ${level.toLocaleString('en-US')} BPM`,
  },
  crashName: 'Crash',
  crashedVerb: 'clocked out',
  crashes: [
    { title: 'HEART FLUTTER', caption: 'The heart left for a minute. It’s back.', sound: 'faint' },
    { title: 'SPILLED ON THE BOSS', caption: 'The whole pot. Right down the tie.', sound: 'spill' },
    { title: 'KEYBOARD NAP', caption: 'jjjjjjjjjjjjjjjjjjjj', sound: 'clack' },
  ],
  crowd: [
    'DecafDenise',
    'DoubleShotDave',
    'ReplyAllRick',
    'CubicleCathy',
    'SprintSteve',
    'StandupSam',
    'SynergySue',
    'LatteLarry',
    'MeetingMolly',
    'PaperJamPete',
    'InternIan',
    'KeurigKevin',
    'CtrlAltDelia',
    'TPSReportTom',
    'CornerOfficeCarl',
    'MicrowaveFishFran',
    'MonitorMike',
    'BurnoutBecky',
    'ActionItemAmy',
    'BreakRoomBob',
    'WaterCoolerWill',
    'ScrumMasterSid',
    'HotDeskHank',
    'ExcelEddie',
    'AgendaAnna',
    'OutOfOfficeOtto',
    'StaplerStan',
    'PerfReviewPat',
    'FridayFeeling',
    'CopyRoomCleo',
    'MugShotMarge',
    'CalendarInviteCal',
    'EspressoEsme',
    'BoardroomBlake',
    'HRHelen',
    'ZoomFatigueZed',
    'FaxMachineFred',
    'DeadlineDee',
    'BeanCounterBen',
    'OvertimeOwen',
  ],
  refill: { who: 'Gary in Accounting', quip: 'Take the petty cash. Don’t tell Linda.', stat: 'Coins from Gary' },
  help: {
    eyebrow: 'Mind the heart rate',
    story:
      'One intern, one desk and an espresso machine with no off switch. Every round another shot goes down, the clock spins faster and the multiplier climbs from 1.00× with it. Sooner or later something gives: the heart, the pot or the keyboard. Cash out before it does and you win your bet times the multiplier. Wait too long and you get a nap.',
    back: 'Back to the desk',
  },
  sound: {
    whine: { type: 'square', base: 330, slope: 0.7 },
    beat: { freq: 90, bpm: 130, slope: 36 },
    launch: 'grind',
    milestone: { wave: 'square', base: 587, ratios: [1, 1.19, 1.5, 1.78], step: 0.045 },
  },
  scene: () => new EspressoScene(),
};
