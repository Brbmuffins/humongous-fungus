// Hammy Slots' drawings: every symbol, drawn on a canvas (no image files).
// Cube Hammy, the meatball sub and the robot vacuum are the game's own
// drawings; the rest are made here. Each symbol is drawn once into a small
// canvas of its own (a sprite) and the reels just move those about.
import { defaultLook, drawHammy } from './hammy';
import { drawVacuum } from './room';
import type { SlotSymbol } from './slots';

type Ctx = CanvasRenderingContext2D;

const INK = '#2b1a10';
const TAU = Math.PI * 2;

/** The tile each symbol sits on: its top and bottom colour. */
export const TILE: Record<SlotSymbol, [string, string]> = {
  dorkito: ['#5a2d1c', '#3a1b12'],
  pizza: ['#4a3322', '#2e1f14'],
  sneaker: ['#27406b', '#172745'],
  tp: ['#2e4a5a', '#1b2e3a'],
  clipboard: ['#3b3a66', '#26254a'],
  grandma: ['#5a3668', '#3a2147'],
  vacuum: ['#2a5a56', '#173a38'],
  toilet: ['#3f5f86', '#243d5e'],
  hammy: ['#8a5a10', '#4e3008'],
  wild: ['#14673e', '#0a3d24'],
  orb: ['#2a1650', '#120a2a'],
};

function outline(c: Ctx, w: number): void {
  c.lineWidth = w;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
}

/** One symbol, centred on (0, 0), about 2s across. `t` is seconds, for the few that move. */
function paint(c: Ctx, id: SlotSymbol, s: number, t: number): void {
  const lw = Math.max(1.5, s * 0.07);
  outline(c, lw);
  switch (id) {
    case 'dorkito': {
      // A triangle of corn chip, dusted, with a bite out of it.
      c.save();
      c.rotate(-0.25);
      const p = (x: number, y: number): [number, number] => [x * s, y * s];
      c.beginPath();
      c.moveTo(...p(0, -0.78));
      c.quadraticCurveTo(...p(0.2, -0.5), ...p(0.78, 0.55));
      c.quadraticCurveTo(...p(0, 0.72), ...p(-0.78, 0.55));
      c.quadraticCurveTo(...p(-0.2, -0.5), ...p(0, -0.78));
      c.closePath();
      const g = c.createLinearGradient(0, -s * 0.8, 0, s * 0.7);
      g.addColorStop(0, '#ffb23a');
      g.addColorStop(1, '#e8540f');
      c.fillStyle = g;
      c.fill();
      c.stroke();
      c.fillStyle = '#ffd98a';
      for (const [x, y, r] of [[-0.05, -0.2, 0.08], [0.3, 0.2, 0.07], [-0.35, 0.3, 0.07], [0.05, 0.28, 0.06], [-0.1, 0.05, 0.05], [0.22, -0.08, 0.05]] as const) {
        c.beginPath();
        c.arc(x * s, y * s, r * s, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#c4300a';
      c.beginPath();
      c.arc(-0.2 * s, 0.4 * s, 0.05 * s, 0, TAU);
      c.arc(0.4 * s, 0.38 * s, 0.045 * s, 0, TAU);
      c.fill();
      c.restore();
      break;
    }
    case 'pizza': {
      // A pizza box from above, a grease spot coming through the lid.
      const b = s * 0.78;
      c.fillStyle = '#d9a86a';
      c.beginPath();
      c.roundRect(-b, -b, b * 2, b * 2, s * 0.1);
      c.fill();
      c.stroke();
      c.strokeStyle = '#a97a3f';
      c.lineWidth = lw * 0.7;
      c.beginPath();
      c.moveTo(-b, -b * 0.55);
      c.lineTo(b, -b * 0.55);
      c.stroke();
      outline(c, lw);
      // The logo: a red slice.
      c.fillStyle = '#d62f22';
      c.beginPath();
      c.moveTo(-b * 0.38, b * 0.0);
      c.lineTo(b * 0.38, b * 0.0);
      c.lineTo(0, b * 0.62);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#ffd34d';
      c.beginPath();
      c.arc(-b * 0.08, b * 0.14, s * 0.06, 0, TAU);
      c.arc(b * 0.14, b * 0.12, s * 0.05, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(120, 70, 20, 0.35)';
      c.beginPath();
      c.ellipse(b * 0.45, -b * 0.15, s * 0.22, s * 0.14, 0.5, 0, TAU);
      c.fill();
      break;
    }
    case 'sneaker': {
      // A high-top, side on, toe to the right.
      c.save();
      c.translate(0, s * 0.05);
      c.rotate(-0.05);
      c.fillStyle = '#f3f0e8';
      c.beginPath();
      c.moveTo(-0.72 * s, -0.55 * s);
      c.lineTo(-0.15 * s, -0.6 * s);
      c.lineTo(-0.05 * s, -0.2 * s);
      c.quadraticCurveTo(0.35 * s, -0.12 * s, 0.62 * s, 0.1 * s);
      c.quadraticCurveTo(0.82 * s, 0.22 * s, 0.82 * s, 0.4 * s);
      c.lineTo(-0.74 * s, 0.4 * s);
      c.closePath();
      c.fill();
      c.stroke();
      // Sole.
      c.fillStyle = '#e8402f';
      c.beginPath();
      c.roundRect(-0.78 * s, 0.34 * s, 1.64 * s, 0.24 * s, s * 0.1);
      c.fill();
      c.stroke();
      // Toe cap, stripe, laces.
      c.fillStyle = '#2f6fe0';
      c.beginPath();
      c.moveTo(0.4 * s, -0.02 * s);
      c.quadraticCurveTo(0.8 * s, 0.14 * s, 0.82 * s, 0.38 * s);
      c.lineTo(0.38 * s, 0.38 * s);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = INK;
      c.lineWidth = lw * 0.8;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo((-0.05 + i * 0.14) * s, (-0.18 + i * 0.06) * s);
        c.lineTo((0.13 + i * 0.14) * s, (-0.1 + i * 0.06) * s);
        c.stroke();
      }
      c.restore();
      break;
    }
    case 'tp': {
      // A roll, end on at a slant, with a trailing sheet.
      c.fillStyle = '#fbf7ee';
      c.beginPath();
      c.moveTo(0.1 * s, 0.45 * s);
      c.lineTo(0.62 * s, 0.7 * s);
      c.lineTo(0.9 * s, 0.7 * s);
      c.lineTo(0.9 * s, 0.62 * s);
      c.quadraticCurveTo(0.5 * s, 0.6 * s, 0.1 * s, 0.45 * s);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#fffdf6';
      c.beginPath();
      c.roundRect(-0.6 * s, -0.62 * s, 1.2 * s, 1.2 * s, s * 0.2);
      c.fill();
      c.stroke();
      c.fillStyle = '#e8d9b5';
      c.beginPath();
      c.ellipse(0, -0.02 * s, 0.3 * s, 0.34 * s, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#b79a68';
      c.beginPath();
      c.ellipse(0, -0.02 * s, 0.13 * s, 0.17 * s, 0, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(43,26,16,0.3)';
      c.lineWidth = lw * 0.6;
      c.beginPath();
      c.moveTo(-0.5 * s, 0.32 * s);
      c.lineTo(0.5 * s, 0.32 * s);
      c.stroke();
      break;
    }
    case 'clipboard': {
      c.fillStyle = '#a8682c';
      c.beginPath();
      c.roundRect(-0.55 * s, -0.78 * s, 1.1 * s, 1.55 * s, s * 0.1);
      c.fill();
      c.stroke();
      c.fillStyle = '#fffdf5';
      c.beginPath();
      c.roundRect(-0.43 * s, -0.55 * s, 0.86 * s, 1.2 * s, s * 0.05);
      c.fill();
      c.stroke();
      c.fillStyle = '#c9ccd2';
      c.beginPath();
      c.roundRect(-0.24 * s, -0.88 * s, 0.48 * s, 0.24 * s, s * 0.06);
      c.fill();
      c.stroke();
      // Dr. Moss's notes, and a verdict.
      c.strokeStyle = '#3d4b8a';
      c.lineWidth = lw * 0.6;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(-0.32 * s, (-0.3 + i * 0.2) * s);
        c.lineTo((0.3 - i * 0.07) * s, (-0.3 + i * 0.2) * s);
        c.stroke();
      }
      c.strokeStyle = '#d62f22';
      c.lineWidth = lw * 1.1;
      c.beginPath();
      c.moveTo(-0.24 * s, 0.38 * s);
      c.lineTo(-0.1 * s, 0.52 * s);
      c.lineTo(0.28 * s, 0.2 * s);
      c.stroke();
      break;
    }
    case 'grandma': {
      // Grey hair, a bun, big glasses and a cardigan.
      c.fillStyle = '#6aa07a';
      c.beginPath();
      c.ellipse(0, 0.82 * s, 0.7 * s, 0.42 * s, 0, Math.PI, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#e0e0ea';
      c.beginPath();
      c.arc(0, -0.64 * s, 0.22 * s, 0, TAU);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(0, -0.08 * s, 0.6 * s, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#f6c9a4';
      c.beginPath();
      c.ellipse(0, 0.02 * s, 0.46 * s, 0.5 * s, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#e0e0ea';
      c.beginPath();
      c.moveTo(-0.5 * s, -0.12 * s);
      c.quadraticCurveTo(0, -0.62 * s, 0.5 * s, -0.12 * s);
      c.quadraticCurveTo(0, -0.3 * s, -0.5 * s, -0.12 * s);
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.65)';
      c.strokeStyle = INK;
      c.lineWidth = lw * 0.8;
      for (const x of [-0.2, 0.2]) {
        c.beginPath();
        c.arc(x * s, 0.0, 0.16 * s, 0, TAU);
        c.fill();
        c.stroke();
      }
      c.beginPath();
      c.moveTo(-0.04 * s, -0.02 * s);
      c.lineTo(0.04 * s, -0.02 * s);
      c.stroke();
      c.fillStyle = INK;
      for (const x of [-0.2, 0.2]) {
        c.beginPath();
        c.arc(x * s, 0.01 * s, 0.045 * s, 0, TAU);
        c.fill();
      }
      c.strokeStyle = '#a8423a';
      c.lineWidth = lw;
      c.beginPath();
      c.arc(0, 0.2 * s, 0.14 * s, 0.2, Math.PI - 0.2);
      c.stroke();
      c.fillStyle = 'rgba(240,120,120,0.45)';
      for (const x of [-0.32, 0.32]) {
        c.beginPath();
        c.arc(x * s, 0.18 * s, 0.08 * s, 0, TAU);
        c.fill();
      }
      break;
    }
    case 'vacuum': {
      drawVacuum(c, 0, s * 0.42, s * 0.72, t * 1000 + 300, 1);
      break;
    }
    case 'toilet': {
      // Front on: tank, seat and bowl, with a gold handle.
      c.fillStyle = '#f4f6fa';
      c.beginPath();
      c.roundRect(-0.42 * s, -0.82 * s, 0.84 * s, 0.5 * s, s * 0.1);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffd34d';
      c.beginPath();
      c.roundRect(0.22 * s, -0.76 * s, 0.14 * s, 0.1 * s, s * 0.03);
      c.fill();
      c.stroke();
      c.fillStyle = '#e4e9f2';
      c.beginPath();
      c.ellipse(0, -0.12 * s, 0.62 * s, 0.34 * s, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#4aa6d8';
      c.beginPath();
      c.ellipse(0, -0.1 * s, 0.42 * s, 0.2 * s, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#f4f6fa';
      c.beginPath();
      c.moveTo(-0.55 * s, 0.05 * s);
      c.quadraticCurveTo(-0.5 * s, 0.55 * s, -0.2 * s, 0.62 * s);
      c.lineTo(-0.28 * s, 0.82 * s);
      c.lineTo(0.28 * s, 0.82 * s);
      c.lineTo(0.2 * s, 0.62 * s);
      c.quadraticCurveTo(0.5 * s, 0.55 * s, 0.55 * s, 0.05 * s);
      c.quadraticCurveTo(0, 0.2 * s, -0.55 * s, 0.05 * s);
      c.fill();
      c.stroke();
      break;
    }
    case 'hammy': {
      // Cube Hammy, delighted, in front of a gold burst.
      c.save();
      const g = c.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 0.95);
      g.addColorStop(0, 'rgba(255, 226, 120, 0.95)');
      g.addColorStop(1, 'rgba(255, 190, 40, 0)');
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const r = i % 2 ? s * 0.62 : s * 0.98;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      const look = defaultLook('classic', 'cube');
      look.face = 'joy';
      look.armsUp = true;
      drawHammy(c, 0, s * 0.02, s * 0.62, look, t);
      c.restore();
      break;
    }
    case 'wild': {
      // Hammy as a meatball sub, with a ribbon.
      const look = defaultLook('classic', 'sub');
      look.face = 'smug';
      drawHammy(c, 0, -s * 0.12, s * 0.5, look, t);
      c.fillStyle = '#ffd34d';
      c.beginPath();
      c.roundRect(-s * 0.92, s * 0.42, s * 1.84, s * 0.38, s * 0.1);
      c.fill();
      outline(c, lw);
      c.stroke();
      c.fillStyle = INK;
      c.font = `900 ${s * 0.3}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('WILD', 0, s * 0.62);
      break;
    }
    case 'orb': {
      // A ball of lightning.
      const wob = 1 + Math.sin(t * 6) * 0.03;
      const halo = c.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 0.95);
      halo.addColorStop(0, 'rgba(120, 220, 255, 0.55)');
      halo.addColorStop(1, 'rgba(120, 220, 255, 0)');
      c.fillStyle = halo;
      c.beginPath();
      c.arc(0, 0, s * 0.95, 0, TAU);
      c.fill();
      const g = c.createRadialGradient(-s * 0.2, -s * 0.22, s * 0.05, 0, 0, s * 0.62 * wob);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#8ee8ff');
      g.addColorStop(0.8, '#7a3df0');
      g.addColorStop(1, '#4a1fb0');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, s * 0.62 * wob, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = lw * 0.9;
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + t * 1.5;
        c.beginPath();
        let x = Math.cos(a) * s * 0.1;
        let y = Math.sin(a) * s * 0.1;
        c.moveTo(x, y);
        for (let i = 1; i <= 4; i++) {
          x = Math.cos(a + (i % 2 ? 0.35 : -0.3)) * s * (0.1 + i * 0.12);
          y = Math.sin(a + (i % 2 ? 0.35 : -0.3)) * s * (0.1 + i * 0.12);
          c.lineTo(x, y);
        }
        c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath();
      c.ellipse(-s * 0.24, -s * 0.28, s * 0.14, s * 0.08, -0.6, 0, TAU);
      c.fill();
      break;
    }
  }
}

/** Draw one symbol centred on (x, y), `size` across (the cell it sits in). */
export function drawSymbol(c: Ctx, id: SlotSymbol, x: number, y: number, size: number, t = 0): void {
  c.save();
  c.translate(x, y);
  paint(c, id, size * 0.42, t);
  c.restore();
}

/** A cache of every symbol drawn once at a size, as small canvases. */
export class Sprites {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(private dpr: () => number) {}

  /** The symbol as a canvas `size` CSS pixels square (times the pixel density). */
  get(id: SlotSymbol, size: number): HTMLCanvasElement {
    const d = this.dpr();
    const px = Math.max(8, Math.round(size * d));
    const key = `${id}:${px}`;
    let cv = this.cache.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = px;
      cv.height = px;
      const c = cv.getContext('2d')!;
      c.scale(px / size, px / size);
      drawSymbol(c, id, size / 2, size / 2, size, 0.4);
      if (this.cache.size > 80) this.cache.clear();
      this.cache.set(key, cv);
    }
    return cv;
  }
}

/** The two colours of a tile for a symbol, for tiles drawn elsewhere. */
export const tileColors = (id: SlotSymbol): [string, string] => TILE[id];
