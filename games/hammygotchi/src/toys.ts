// What the toys look like, in the tank and on the toy bar. Each is drawn
// around (x, y) at size s (about its radius).
import type { ToyId } from './defs';

const TAU = Math.PI * 2;
const INK = '#2b1a10';

type Ctx = CanvasRenderingContext2D;

function blob(c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

function hand(c: Ctx, s: number): void {
  // A cartoon glove, pointing up.
  c.fillStyle = '#fffaf0';
  c.beginPath();
  c.roundRect(-s * 0.18, -s * 0.95, s * 0.36, s * 0.9, s * 0.18);
  c.fill();
  c.stroke();
  for (const [dx, h] of [
    [0.2, 0.55],
    [0.5, 0.48],
    [0.78, 0.4],
  ]) {
    c.beginPath();
    c.roundRect(-s * 0.18 + dx * s * 0.9, -s * h, s * 0.3, s * 0.6, s * 0.15);
    c.fill();
    c.stroke();
  }
  c.beginPath();
  c.roundRect(-s * 0.45, -s * 0.15, s * 1.25, s * 0.75, s * 0.3);
  c.fill();
  c.stroke();
  c.beginPath();
  c.roundRect(-s * 0.3, s * 0.5, s * 0.95, s * 0.35, s * 0.1);
  c.fill();
  c.stroke();
}

function feather(c: Ctx, s: number, t: number): void {
  c.save();
  c.rotate(-0.6 + Math.sin(t * 0.01) * 0.15);
  c.fillStyle = '#ff8fc8';
  c.beginPath();
  c.moveTo(0, -s);
  c.quadraticCurveTo(s * 0.55, -s * 0.3, s * 0.1, s * 0.75);
  c.quadraticCurveTo(-s * 0.5, -s * 0.1, 0, -s);
  c.fill();
  c.stroke();
  c.strokeStyle = 'rgba(43,26,16,0.6)';
  for (let i = 0; i < 4; i++) {
    const y = -s * 0.55 + i * s * 0.3;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(s * 0.25, y - s * 0.15);
    c.moveTo(0, y);
    c.lineTo(-s * 0.22, y - s * 0.12);
    c.stroke();
  }
  c.strokeStyle = INK;
  c.beginPath();
  c.moveTo(0, -s * 0.9);
  c.quadraticCurveTo(s * 0.05, 0, -s * 0.05, s);
  c.stroke();
  c.restore();
}

function ball(c: Ctx, s: number, spin: number): void {
  c.fillStyle = '#ff4d6d';
  blob(c, 0, 0, s, s);
  c.fill();
  c.stroke();
  c.save();
  blob(c, 0, 0, s, s);
  c.clip();
  c.rotate(spin);
  c.fillStyle = '#ffd34d';
  c.fillRect(-s, -s * 0.22, s * 2, s * 0.44);
  c.restore();
  blob(c, 0, 0, s, s);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.55)';
  blob(c, -s * 0.35, -s * 0.4, s * 0.25, s * 0.15, -0.6);
  c.fill();
}

function glove(c: Ctx, s: number): void {
  c.fillStyle = '#e8312a';
  c.beginPath();
  c.ellipse(s * 0.1, 0, s * 0.8, s * 0.7, 0, 0, TAU);
  c.fill();
  c.stroke();
  blob(c, s * 0.15, -s * 0.55, s * 0.32, s * 0.25, -0.3);
  c.fill();
  c.stroke();
  c.fillStyle = '#fffaf0';
  c.beginPath();
  c.roundRect(-s * 0.95, -s * 0.42, s * 0.4, s * 0.84, s * 0.12);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  blob(c, s * 0.25, -s * 0.2, s * 0.25, s * 0.15, -0.4);
  c.fill();
}

function balloon(c: Ctx, s: number, wobble: number): void {
  c.save();
  c.scale(1 + wobble * 0.08, 1 - wobble * 0.08);
  c.fillStyle = '#4aa3ff';
  c.beginPath();
  c.moveTo(0, -s);
  c.bezierCurveTo(s * 0.95, -s, s * 0.85, s * 0.6, 0, s * 0.8);
  c.bezierCurveTo(-s * 0.85, s * 0.6, -s * 0.95, -s, 0, -s);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  blob(c, -s * 0.3, -s * 0.45, s * 0.18, s * 0.28, 0.3);
  c.fill();
  c.restore();
  c.fillStyle = '#2f7fe0';
  c.beginPath();
  c.moveTo(-s * 0.12, s * 0.95);
  c.lineTo(s * 0.12, s * 0.95);
  c.lineTo(0, s * 0.8);
  c.closePath();
  c.fill();
  c.stroke();
}

function pie(c: Ctx, s: number): void {
  c.fillStyle = '#b9bec8';
  c.beginPath();
  c.moveTo(-s, s * 0.05);
  c.lineTo(s, s * 0.05);
  c.lineTo(s * 0.75, s * 0.45);
  c.lineTo(-s * 0.75, s * 0.45);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#fffaf0';
  c.beginPath();
  c.moveTo(-s * 0.95, s * 0.08);
  c.quadraticCurveTo(-s * 0.9, -s * 0.55, 0, -s * 0.6);
  c.quadraticCurveTo(s * 0.9, -s * 0.55, s * 0.95, s * 0.08);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#e8312a';
  blob(c, 0, -s * 0.68, s * 0.16, s * 0.16);
  c.fill();
  c.stroke();
}

function cushion(c: Ctx, s: number, squash: number): void {
  c.save();
  c.scale(1 + squash * 0.3, 1 - squash * 0.5);
  c.fillStyle = '#ff6fa8';
  blob(c, 0, 0, s, s * 0.55);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  blob(c, -s * 0.35, -s * 0.2, s * 0.3, s * 0.12, -0.2);
  c.fill();
  c.restore();
  c.fillStyle = '#e0508c';
  c.beginPath();
  c.roundRect(s * 0.85, -s * 0.14, s * 0.4, s * 0.28, s * 0.08);
  c.fill();
  c.stroke();
}

function magnet(c: Ctx, s: number): void {
  c.lineCap = 'butt';
  c.strokeStyle = INK;
  c.lineWidth = s * 0.62;
  c.beginPath();
  c.arc(0, -s * 0.1, s * 0.55, Math.PI, TAU);
  c.lineTo(s * 0.55, s * 0.7);
  c.moveTo(-s * 0.55, -s * 0.1);
  c.lineTo(-s * 0.55, s * 0.7);
  c.stroke();
  c.strokeStyle = '#e8312a';
  c.lineWidth = s * 0.46;
  c.beginPath();
  c.arc(0, -s * 0.1, s * 0.55, Math.PI, TAU);
  c.lineTo(s * 0.55, s * 0.4);
  c.moveTo(-s * 0.55, -s * 0.1);
  c.lineTo(-s * 0.55, s * 0.4);
  c.stroke();
  c.strokeStyle = '#d7dbe3';
  c.beginPath();
  c.moveTo(-s * 0.55, s * 0.42);
  c.lineTo(-s * 0.55, s * 0.68);
  c.moveTo(s * 0.55, s * 0.42);
  c.lineTo(s * 0.55, s * 0.68);
  c.stroke();
  c.lineCap = 'round';
  c.lineWidth = Math.max(1.2, s * 0.08);
}

function firecracker(c: Ctx, s: number, lit: boolean, t: number): void {
  c.fillStyle = '#e8312a';
  c.beginPath();
  c.roundRect(-s * 0.32, -s * 0.6, s * 0.64, s * 1.3, s * 0.1);
  c.fill();
  c.stroke();
  c.fillStyle = '#ffd34d';
  c.fillRect(-s * 0.32, -s * 0.15, s * 0.64, s * 0.2);
  c.strokeRect(-s * 0.32, -s * 0.15, s * 0.64, s * 0.2);
  c.beginPath();
  c.moveTo(0, -s * 0.6);
  c.quadraticCurveTo(s * 0.3, -s * 0.9, s * 0.15, -s * 1.1);
  c.stroke();
  if (lit) {
    for (let i = 0; i < 6; i++) {
      const a = t * 0.02 + (i * TAU) / 6;
      const len = s * (0.15 + ((i * 7 + Math.floor(t / 40)) % 5) * 0.06);
      c.strokeStyle = i % 2 ? '#ffd34d' : '#fff3b0';
      c.beginPath();
      c.moveTo(s * 0.15, -s * 1.1);
      c.lineTo(s * 0.15 + Math.cos(a) * len, -s * 1.1 + Math.sin(a) * len);
      c.stroke();
    }
    c.strokeStyle = INK;
  }
}

export interface ToyLook {
  /** Ball spin, balloon wobble or cushion squash. */
  k?: number;
  lit?: boolean;
}

export function drawToy(c: Ctx, id: ToyId, x: number, y: number, s: number, t: number, look: ToyLook = {}): void {
  c.save();
  c.translate(x, y);
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.2, s * 0.08);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  switch (id) {
    case 'hand':
      hand(c, s);
      break;
    case 'feather':
      feather(c, s, t);
      break;
    case 'ball':
      ball(c, s, look.k ?? 0);
      break;
    case 'glove':
      glove(c, s);
      break;
    case 'balloon':
      balloon(c, s, look.k ?? 0);
      break;
    case 'pie':
      pie(c, s);
      break;
    case 'cushion':
      cushion(c, s, look.k ?? 0);
      break;
    case 'magnet':
      magnet(c, s);
      break;
    case 'firecracker':
      firecracker(c, s, look.lit ?? false, t);
      break;
  }
  c.restore();
}

/** A toy on its own little canvas, for the toy bar and the shop. */
export function paintToyIcon(canvas: HTMLCanvasElement, id: ToyId): void {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.width;
  const h = rect.height || canvas.height;
  if (w < 4 || h < 4) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const s = Math.min(w, h) * (id === 'cushion' ? 0.32 : 0.36);
  drawToy(c, id, w / 2 - (id === 'cushion' ? s * 0.15 : 0), h / 2 + (id === 'firecracker' ? s * 0.2 : 0), s, 600);
}
