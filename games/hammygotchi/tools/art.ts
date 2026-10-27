// Renders the app icon, launch screen and Play feature graphic from the same
// drawing code as the game. Served by Vite (npm run dev:hammygotchi), opened
// by scripts/make-art.mjs:
//   /tools/art.html?kind=icon     1024×1024, opaque
//   /tools/art.html?kind=splash   2732×2732, Hammy and the wordmark in the middle
//   /tools/art.html?kind=feature  1024×500, Google Play feature graphic
import '@fontsource/bagel-fat-one/latin-400.css';
import '@fontsource/rubik/latin-600.css';
import { EXTENTS, defaultLook, drawHammy } from '../src/hammy';
import { BOWL_MAX } from '../src/defs';
import { drawBowl, drawFridge, drawGlass, drawIntercom, drawMonitor, drawOven, drawPan, drawPlant, drawSteak, drawTrash, drawWallLife, layoutRoom, paintRoom } from '../src/room';

const kind = new URLSearchParams(location.search).get('kind') ?? 'icon';
const BG = '#1a1026';
const CHEESE = '#ff9a2e';
const MUTED = '#b9a9cc';
const TAU = Math.PI * 2;

type Ctx = CanvasRenderingContext2D;

/** The gamer bedroom: dark purple wall with an LED glow along the top. */
function room(c: Ctx, w: number, h: number): void {
  const wall = c.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, '#33204f');
  wall.addColorStop(1, '#160d24');
  c.fillStyle = wall;
  c.fillRect(0, 0, w, h);
  const glow = c.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.6);
  glow.addColorStop(0, 'rgba(255,154,46,0.18)');
  glow.addColorStop(1, 'rgba(255,154,46,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
}

/** Wavy green stink lines rising from (x, y). */
function stink(c: Ctx, x: number, y: number, spread: number, size: number): void {
  c.strokeStyle = 'rgba(181,227,59,0.9)';
  c.lineWidth = size * 0.05;
  c.lineCap = 'round';
  for (const [i, dx] of [-1, 0, 1].entries()) {
    c.beginPath();
    for (let k = 0; k <= 12; k++) {
      const yy = y - k * size * 0.06 - (i === 1 ? size * 0.08 : 0);
      const xx = x + dx * spread + Math.sin(k * 0.8 + i) * size * 0.04;
      if (k === 0) c.moveTo(xx, yy);
      else c.lineTo(xx, yy);
    }
    c.stroke();
  }
}

/** A fart cloud: a few overlapping green puffs. */
function cloud(c: Ctx, x: number, y: number, s: number): void {
  for (const [dx, dy, r] of [
    [0, 0, 1],
    [0.8, -0.3, 0.75],
    [1.4, 0.2, 0.6],
    [-0.6, 0.35, 0.6],
  ]) {
    c.fillStyle = 'rgba(166,210,58,0.75)';
    c.beginPath();
    c.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
    c.fill();
  }
}

/** Yellow and black hazard stripes across a band, like the unit's frame. */
function hazard(c: Ctx, y: number, w: number, h: number): void {
  c.save();
  c.beginPath();
  c.rect(0, y, w, h);
  c.clip();
  c.fillStyle = '#1f1a24';
  c.fillRect(0, y, w, h);
  c.fillStyle = '#f2c230';
  for (let x = -h; x < w + h; x += h * 1.2) {
    c.beginPath();
    c.moveTo(x, y + h);
    c.lineTo(x + h * 0.6, y + h);
    c.lineTo(x + h * 1.2, y);
    c.lineTo(x + h * 0.6, y);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** The containment unit, with him in his armchair and a steak on, as a picture. */
function unit(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const m = layoutRoom(w, h);
  paintRoom(c, m);
  // The clock at ten past ten, like every clock in an advert.
  drawWallLife(c, m, 0, new Date(2026, 0, 1, 10, 10, 30), true);
  drawIntercom(c, m.intercom, false, false, 0);
  // He didn't flush, and he left some stuff around.
  drawBowl(c, m.toilet, 2, BOWL_MAX, 0);
  const ts = m.r * 0.55;
  drawTrash(c, 'pizza', m.chair.x1 + ts * 0.6, m.ground - 1, ts, 0.05);
  drawTrash(c, 'can', m.ladder.x0 - ts * 0.9, m.ground - 1, ts, -0.1);
  drawTrash(c, 'sock', m.bed.x1 - ts * 1.5, m.loft - 1, ts);
  drawPlant(c, m.plant, 0.6, 0);
  drawMonitor(c, m.pc, 900, true);
  drawFridge(c, m.fridge, 0);
  drawOven(c, m.oven, 0.9);
  const pan = drawPan(c, m.oven);
  drawSteak(c, pan.x, pan.y, m.r * 0.35, 'steak');
  const chair = m.chair;
  const hh = m.r * EXTENTS.cube.h;
  const hx = (chair.x0 + chair.x1) / 2;
  const hy = chair.y0 + (chair.y1 - chair.y0) * 0.35 - hh * 0.9;
  cloud(c, hx - m.r * 1.6, hy + m.r * 0.4, m.r * 0.35);
  drawHammy(c, hx, hy, m.r, { ...defaultLook('classic'), face: 'smug', sx: 1.04, sy: 0.92 }, 0);
  drawGlass(c, m);
  return canvas;
}

function wordmark(c: Ctx, x: number, y: number, size: number, align: CanvasTextAlign = 'center'): void {
  c.font = `400 ${size}px 'Bagel Fat One'`;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#6b2a00';
  c.fillText('Hammygotchi', x, y + size * 0.09);
  c.fillStyle = CHEESE;
  c.fillText('Hammygotchi', x, y);
}

async function main(): Promise<void> {
  await Promise.all([document.fonts.load("400 100px 'Bagel Fat One'"), document.fonts.load('600 30px Rubik')]);
  const out = document.createElement('canvas');
  const c = out.getContext('2d')!;
  if (kind === 'icon') {
    out.width = out.height = 1024;
    room(c, 1024, 1024);
    hazard(c, 860, 1024, 164);
    // Kept inside the middle so the rounded corners never clip him.
    cloud(c, 200, 700, 58);
    stink(c, 540, 250, 110, 330);
    drawHammy(c, 540, 600, 250, { ...defaultLook('classic'), face: 'happy', mouth: 0.35 }, 0);
  } else if (kind === 'feature') {
    out.width = 1024;
    out.height = 500;
    room(c, 1024, 500);
    // The unit on the right, the name on the left.
    c.drawImage(unit(560, 500), 464, 0);
    wordmark(c, 236, 190, 70);
    c.fillStyle = MUTED;
    c.font = '600 24px Rubik';
    c.textAlign = 'center';
    c.fillText('A virtual pet who is a lot.', 236, 240);
    c.fillText('He never flushes. He leaves', 236, 300);
    c.fillText('trash everywhere. Good luck.', 236, 332);
    drawHammy(c, 120, 420, 34, { ...defaultLook('classic', 'sub'), face: 'happy' }, 0);
    drawHammy(c, 236, 425, 30, { ...defaultLook('classic', 'hamster'), face: 'joy' }, 0);
    drawHammy(c, 352, 418, 32, { ...defaultLook('cowboy', 'train'), face: 'smug', roll: 0.6 }, 0);
  } else {
    out.width = out.height = 2732;
    c.fillStyle = BG;
    c.fillRect(0, 0, 2732, 2732);
    // Only the middle ~1200px column shows on a phone, so keep everything in it.
    const glow = c.createRadialGradient(1366, 1250, 0, 1366, 1250, 760);
    glow.addColorStop(0, 'rgba(255,154,46,0.12)');
    glow.addColorStop(1, 'rgba(255,154,46,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, 2732, 2732);
    stink(c, 1366, 860, 120, 760);
    drawHammy(c, 1366, 1250, 280, { ...defaultLook('classic'), face: 'happy', mouth: 0.35 }, 0);
    wordmark(c, 1366, 1830, 190);
  }
  out.id = 'art';
  document.body.append(out);
  document.body.dataset.ready = '1';
}

void main();
