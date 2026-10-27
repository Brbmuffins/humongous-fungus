// Renders the app icon, launch screen and Play feature graphic from the same
// drawing code as the game. Served by Vite (npm run dev:hammygotchi), opened
// by scripts/make-art.mjs:
//   /tools/art.html?kind=icon     1024×1024, opaque
//   /tools/art.html?kind=splash   2732×2732, Hammy and the wordmark in the middle
//   /tools/art.html?kind=feature  1024×500, Google Play feature graphic
import '@fontsource/bagel-fat-one/latin-400.css';
import '@fontsource/rubik/latin-600.css';
import { defaultLook, drawHammy } from '../src/hammy';

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
    // Kept inside the middle so the rounded corners never clip him.
    cloud(c, 215, 735, 62);
    stink(c, 512, 300, 110, 360);
    drawHammy(c, 520, 610, 285, { ...defaultLook('classic'), face: 'joy', mouth: 0.4 }, 0);
  } else if (kind === 'feature') {
    out.width = 1024;
    out.height = 500;
    room(c, 1024, 500);
    // The three things he might be today, on the desk.
    c.fillStyle = '#5a3b26';
    c.fillRect(0, 410, 1024, 90);
    c.fillStyle = '#7a5236';
    c.fillRect(0, 410, 1024, 5);
    drawHammy(c, 160, 330, 72, { ...defaultLook('roadtrip'), face: 'joy' }, 0);
    drawHammy(c, 470, 365, 64, { ...defaultLook('classic', 'sub'), face: 'happy' }, 0);
    drawHammy(c, 820, 350, 64, { ...defaultLook('cowboy', 'train'), face: 'smug', roll: 0.6 }, 0);
    cloud(c, 60, 360, 26);
    wordmark(c, 512, 110, 92);
    c.fillStyle = MUTED;
    c.font = '600 28px Rubik';
    c.textAlign = 'center';
    c.fillText("Some days a hamster. Some days a meatball sub. Some days a train.", 512, 165);
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
    stink(c, 1366, 900, 120, 800);
    drawHammy(c, 1366, 1240, 300, { ...defaultLook('classic'), face: 'joy', mouth: 0.4 }, 0);
    wordmark(c, 1366, 1830, 190);
  }
  out.id = 'art';
  document.body.append(out);
  document.body.dataset.ready = '1';
}

void main();
