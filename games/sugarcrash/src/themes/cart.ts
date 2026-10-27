// Shopping Cart Hill: a kid in a helmet barrels down an endless hill in a
// shopping cart and keeps picking up speed. The hills, trees, lampposts and
// road signs stream past faster and faster, the sky shifts from morning blue
// to a warp-speed magenta, and the wheels throw sparks. The crash is a curb, a
// parked car or a goose; the kid always tumbles into something soft (a bush,
// a leaf pile, a heap of cereal boxes) and sticks the landing, more or less.
import {
  TAU,
  clamp,
  ease,
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

const INK = '#12263a';
const HELMET = '#ff4a3d';
const HILL = ['#7fd36a', '#58bb55', '#3f9f4a'];
const BOXES = ['#ff5252', '#ffc93c', '#3dc5ff', '#8be04a', '#ff8ad8', '#ff9a2e'];

const heat = makeHeat([
  [1, [120, 220, 255]],
  [3, [140, 240, 190]],
  [10, [255, 233, 110]],
  [30, [255, 150, 90]],
  [100, [255, 120, 210]],
]);

/** Warp: 0 on a gentle roll, 1 at full ludicrous speed. */
const warp = (m: number): number => clamp(Math.log2(Math.max(1, m)) / Math.log2(120));

// ---------------------------------------------------------------------------
// The kid and the cart

interface Kid {
  face: 'wheee' | 'oh' | 'dizzy' | 'smug';
  /** Arms in the air, out to the sides, or down. */
  arms: 'up' | 'out' | 'rim';
  t: number;
  m: number;
  /** Legs swinging free, when airborne. */
  legs: number;
}

/** The kid, hips at the origin, units of s: tracksuit, a red helmet, a scarf streaming back. */
function drawKid(c: CanvasRenderingContext2D, s: number, k: Kid, scarf = true): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const lw = Math.max(1.3, s * 0.065);
  // Legs.
  for (const d of [-1, 1]) {
    const sw = Math.sin(k.t * 0.014 + d * 1.6) * k.legs * 0.5;
    const kx = d * s * 0.2 + sw * s * 0.4;
    c.strokeStyle = INK;
    c.lineWidth = Math.max(4, s * 0.3);
    c.beginPath();
    c.moveTo(d * s * 0.12, 0);
    c.lineTo(kx, s * 0.5);
    c.lineTo(kx + s * 0.28, s * 0.85 + sw * s * 0.1);
    c.stroke();
    c.strokeStyle = '#2f7cff';
    c.lineWidth = Math.max(2.4, s * 0.2);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.strokeStyle = INK;
    c.lineWidth = lw;
    c.beginPath();
    c.ellipse(kx + s * 0.4, s * 0.88 + sw * s * 0.1, s * 0.2, s * 0.11, 0, 0, TAU);
    c.fill();
    c.stroke();
  }
  // Scarf.
  if (scarf) {
    c.strokeStyle = INK;
    c.lineWidth = Math.max(4, s * 0.26);
    const wob = Math.sin(k.t * 0.02) * s * 0.12;
    c.beginPath();
    c.moveTo(-s * 0.05, -s * 0.85);
    c.bezierCurveTo(-s * 0.7, -s * 0.8 + wob, -s * 1.2, -s * 1.05 - wob, -s * (1.6 + warp(k.m) * 0.9), -s * 0.8 + wob);
    c.stroke();
    c.strokeStyle = '#ffd23c';
    c.lineWidth = Math.max(2.4, s * 0.17);
    c.stroke();
  }
  // Torso.
  c.fillStyle = '#2f7cff';
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.beginPath();
  c.roundRect(-s * 0.32, -s * 0.95, s * 0.64, s * 1.0, s * 0.16);
  c.fill();
  c.stroke();
  c.fillStyle = '#ffffff';
  c.fillRect(-s * 0.3, -s * 0.5, s * 0.6, s * 0.1);
  // Arms.
  const flail = Math.sin(k.t * 0.016) * 0.15;
  for (const d of [-1, 1]) {
    const sx = d * s * 0.3;
    const sy = -s * 0.8;
    const ex = k.arms === 'up' ? d * s * (0.55 + flail * d * 0.5) : k.arms === 'out' ? d * s * 1.0 : d * s * 0.7;
    const ey = k.arms === 'up' ? -s * (1.65 + flail) : k.arms === 'out' ? -s * 0.9 : -s * 0.15;
    c.strokeStyle = INK;
    c.lineWidth = Math.max(4, s * 0.26);
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(ex, ey);
    c.stroke();
    c.strokeStyle = '#2f7cff';
    c.lineWidth = Math.max(2.4, s * 0.16);
    c.stroke();
    c.fillStyle = '#ffd7b8';
    c.strokeStyle = INK;
    c.lineWidth = lw;
    c.beginPath();
    c.arc(ex, ey, s * 0.13, 0, TAU);
    c.fill();
    c.stroke();
  }
  // Head.
  const hy = -s * 1.38;
  c.fillStyle = '#ffd7b8';
  c.beginPath();
  c.arc(0, hy, s * 0.48, 0, TAU);
  c.fill();
  c.stroke();
  // Helmet: a dome with a stripe and a little vent.
  c.fillStyle = HELMET;
  c.beginPath();
  c.arc(0, hy - s * 0.04, s * 0.56, Math.PI * 1.02, TAU * 1.0 - 0.02);
  c.lineTo(s * 0.55, hy + s * 0.05);
  c.lineTo(-s * 0.55, hy + s * 0.05);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#ffffff';
  c.fillRect(-s * 0.07, hy - s * 0.6, s * 0.14, s * 0.35);
  c.fillStyle = INK;
  c.fillRect(-s * 0.55, hy - s * 0.0, s * 1.1, s * 0.06);
  // Face.
  const wide = warp(k.m);
  c.fillStyle = 'rgba(255,255,255,0.95)';
  for (const d of [-1, 1]) {
    c.beginPath();
    c.ellipse(d * s * 0.2, hy + s * 0.16, s * (0.13 + wide * 0.05), s * (0.15 + wide * 0.07), 0, 0, TAU);
    c.fill();
    c.stroke();
  }
  c.fillStyle = INK;
  if (k.face === 'dizzy') {
    c.strokeStyle = INK;
    for (const d of [-1, 1]) {
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = k.t * 0.014 * d + i * 0.7;
        const r = (i / 16) * s * 0.12;
        const px = d * s * 0.2 + Math.cos(a) * r;
        const py = hy + s * 0.16 + Math.sin(a) * r;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
    }
  } else {
    for (const d of [-1, 1]) {
      c.beginPath();
      c.arc(d * s * 0.2 + (k.face === 'smug' ? 0 : s * 0.03), hy + s * 0.16, s * 0.055, 0, TAU);
      c.fill();
    }
  }
  const my = hy + s * 0.36;
  c.fillStyle = '#7a1230';
  c.strokeStyle = INK;
  c.lineWidth = lw;
  if (k.face === 'smug') {
    c.beginPath();
    c.arc(0, my - s * 0.05, s * 0.14, 0.2, Math.PI - 0.2);
    c.stroke();
  } else if (k.face === 'oh') {
    c.beginPath();
    c.ellipse(0, my, s * 0.09, s * 0.13, 0, 0, TAU);
    c.fill();
    c.stroke();
  } else if (k.face === 'dizzy') {
    c.beginPath();
    c.moveTo(-s * 0.12, my);
    c.quadraticCurveTo(-s * 0.04, my - s * 0.05, 0, my);
    c.quadraticCurveTo(s * 0.04, my + s * 0.07, s * 0.12, my - s * 0.01);
    c.stroke();
  } else {
    c.beginPath();
    c.ellipse(0, my, s * (0.16 + wide * 0.06), s * (0.1 + wide * 0.12), 0, 0, TAU);
    c.fill();
    c.stroke();
  }
}

/** The cart, side view, travelling right: origin at the ground under the middle. */
function drawCart(c: CanvasRenderingContext2D, s: number, spin: number, front?: (c: CanvasRenderingContext2D) => void): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const wr = s * 0.27;
  const wy = -wr;
  // Frame and the pusher handle at the back.
  c.strokeStyle = INK;
  c.lineWidth = Math.max(3.2, s * 0.17);
  c.beginPath();
  c.moveTo(-s * 1.0, -s * 1.15);
  c.lineTo(-s * 1.45, -s * 1.5);
  c.lineTo(-s * 1.75, -s * 1.5);
  c.moveTo(-s * 0.6, -s * 0.5);
  c.lineTo(-s * 0.7, wy);
  c.moveTo(s * 0.6, -s * 0.5);
  c.lineTo(s * 0.7, wy);
  c.stroke();
  c.strokeStyle = '#c4ccd8';
  c.lineWidth = Math.max(1.8, s * 0.09);
  c.stroke();
  // The kid sits in here; the caller draws them between the two halves.
  if (front) front(c);
  // The basket: a see-through wire trapezoid.
  c.fillStyle = 'rgba(190,205,225,0.28)';
  c.beginPath();
  c.moveTo(-s * 1.05, -s * 1.15);
  c.lineTo(s * 1.15, -s * 1.15);
  c.lineTo(s * 0.8, -s * 0.38);
  c.lineTo(-s * 0.75, -s * 0.38);
  c.closePath();
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = Math.max(3.2, s * 0.15);
  c.stroke();
  c.strokeStyle = '#dfe6f0';
  c.lineWidth = Math.max(1.6, s * 0.075);
  c.stroke();
  c.lineWidth = Math.max(1, s * 0.045);
  c.strokeStyle = 'rgba(223,230,240,0.8)';
  for (let i = 1; i < 5; i++) {
    const k = i / 5;
    c.beginPath();
    c.moveTo(lerp(-s * 1.05, s * 1.15, k), -s * 1.15);
    c.lineTo(lerp(-s * 0.75, s * 0.8, k), -s * 0.38);
    c.stroke();
  }
  for (const y of [-0.9, -0.65]) {
    const k = (y + 1.15) / -0.77 * -1;
    c.beginPath();
    c.moveTo(lerp(-s * 1.05, -s * 0.75, k), s * y);
    c.lineTo(lerp(s * 1.15, s * 0.8, k), s * y);
    c.stroke();
  }
  // The kid seat flap: a small red "child seat" tab on the handle side.
  c.fillStyle = '#ff4a3d';
  c.fillRect(-s * 1.78, -s * 1.58, s * 0.35, s * 0.14);
  // Wheels.
  for (const wx of [-s * 0.7, s * 0.7]) {
    c.fillStyle = '#2a3342';
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1.2, s * 0.06);
    c.beginPath();
    c.arc(wx, wy, wr, 0, TAU);
    c.fill();
    c.stroke();
    c.strokeStyle = '#aab4c4';
    c.lineWidth = Math.max(1.2, s * 0.06);
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * TAU) / 3;
      c.beginPath();
      c.moveTo(wx - Math.cos(a) * wr * 0.7, wy - Math.sin(a) * wr * 0.7);
      c.lineTo(wx + Math.cos(a) * wr * 0.7, wy + Math.sin(a) * wr * 0.7);
      c.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// Scenery

type Sign = 'slow' | 'hill' | 'goose' | 'sale' | 'deadend' | 'samples';

function drawSign(c: CanvasRenderingContext2D, kind: Sign, x: number, y: number, s: number): void {
  c.lineJoin = 'round';
  c.strokeStyle = '#5b6677';
  c.lineWidth = Math.max(2, s * 0.14);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y - s * 2.4);
  c.stroke();
  const cy = y - s * 2.9;
  c.lineWidth = Math.max(1.2, s * 0.07);
  c.strokeStyle = INK;
  if (kind === 'slow' || kind === 'hill' || kind === 'goose') {
    c.fillStyle = '#ffd23c';
    c.beginPath();
    c.moveTo(x, cy - s * 0.85);
    c.lineTo(x + s * 0.85, cy);
    c.lineTo(x, cy + s * 0.85);
    c.lineTo(x - s * 0.85, cy);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineWidth = Math.max(1.4, s * 0.1);
    if (kind === 'hill') {
      c.beginPath();
      c.moveTo(x - s * 0.5, cy - s * 0.25);
      c.lineTo(x + s * 0.5, cy + s * 0.35);
      c.stroke();
      c.beginPath();
      c.arc(x + s * 0.12, cy - s * 0.32, s * 0.1, 0, TAU);
      c.fill();
    } else if (kind === 'goose') {
      c.beginPath();
      c.ellipse(x, cy + s * 0.15, s * 0.3, s * 0.18, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(x + s * 0.2, cy + s * 0.05);
      c.quadraticCurveTo(x + s * 0.4, cy - s * 0.3, x + s * 0.28, cy - s * 0.4);
      c.stroke();
    } else {
      c.font = `900 ${Math.max(7, Math.round(s * 0.42))}px Rubik, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('SLOW', x, cy);
    }
  } else {
    const word = kind === 'sale' ? 'SALE!' : kind === 'samples' ? 'FREE SAMPLES' : 'DEAD END';
    c.fillStyle = kind === 'sale' ? '#ff4a3d' : kind === 'samples' ? '#7be0a0' : '#ffffff';
    const w = kind === 'samples' ? s * 2.6 : s * 1.7;
    c.beginPath();
    c.roundRect(x - w / 2, cy - s * 0.5, w, s, s * 0.12);
    c.fill();
    c.stroke();
    c.fillStyle = kind === 'sale' ? '#ffffff' : INK;
    c.font = `900 ${Math.max(7, Math.round(s * (kind === 'samples' ? 0.36 : 0.44)))}px Rubik, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(word, x, cy + 1);
  }
}

function drawTree(c: CanvasRenderingContext2D, x: number, y: number, s: number, hue: number): void {
  c.fillStyle = '#7a4b2a';
  c.fillRect(x - s * 0.14, y - s * 1.3, s * 0.28, s * 1.3);
  c.fillStyle = ['#2f9e4a', '#3fb55a', '#8bc34a'][hue % 3];
  c.beginPath();
  c.arc(x, y - s * 1.9, s * 0.9, 0, TAU);
  c.arc(x - s * 0.6, y - s * 1.45, s * 0.6, 0, TAU);
  c.arc(x + s * 0.6, y - s * 1.45, s * 0.6, 0, TAU);
  c.fill();
}

function drawLamp(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.strokeStyle = '#4b5565';
  c.lineWidth = Math.max(2, s * 0.14);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y - s * 3.4);
  c.quadraticCurveTo(x, y - s * 3.9, x + s * 0.7, y - s * 3.9);
  c.stroke();
  c.fillStyle = '#fff3a8';
  c.beginPath();
  c.ellipse(x + s * 0.75, y - s * 3.82, s * 0.28, s * 0.14, 0, 0, TAU);
  c.fill();
}

interface Near {
  at: number;
  kind: 'tree' | 'lamp' | Sign;
  hue: number;
}

function hillPath(c: CanvasRenderingContext2D, W: number, H: number, base: number, amp: number, off: number, freq: number, ph: number): void {
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) {
    const t = (x + off) * freq + ph;
    c.lineTo(x, base - (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1) * 0.3) * amp);
  }
  c.lineTo(W, H);
  c.closePath();
}

// ---------------------------------------------------------------------------
// The crash set pieces

function drawBush(c: CanvasRenderingContext2D, x: number, y: number, s: number, grow: number, leafy: boolean, since: number): void {
  if (grow <= 0.01) return;
  c.save();
  c.translate(x, y);
  c.scale(grow, grow);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  const cols = leafy ? ['#e8892b', '#f4b63a', '#d65a24'] : ['#2f9e4a', '#46b85a', '#2a8a45'];
  const blobs: readonly (readonly [number, number, number, number])[] = [
    [-1.2, -0.45, 0.8, 0],
    [-0.4, -0.9, 0.95, 1],
    [0.5, -0.85, 0.95, 2],
    [1.3, -0.45, 0.8, 0],
    [0.0, -0.4, 0.95, 1],
  ];
  for (const [bx, by, br, ci] of blobs) {
    c.fillStyle = cols[ci];
    c.beginPath();
    c.arc(bx * s, by * s + Math.sin(since * 9 + bx) * s * 0.03 * Math.exp(-since), br * s * 0.75, 0, TAU);
    c.fill();
    c.stroke();
  }
  if (!leafy) {
    c.fillStyle = '#ff7fb0';
    for (const [fx, fy] of [[-1.0, -0.7], [0.1, -1.3], [1.0, -0.85], [-0.2, -0.5]] as const) {
      c.beginPath();
      c.arc(fx * s, fy * s, s * 0.09, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}

function drawBoxes(c: CanvasRenderingContext2D, x: number, y: number, s: number, grow: number, hit: number): void {
  if (grow <= 0.01) return;
  c.save();
  c.translate(x, y);
  c.scale(grow, grow);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  const stack: readonly (readonly [number, number, number])[] = [
    [-1.3, 0, 0],
    [-0.35, 0, 1],
    [0.6, 0, 2],
    [1.5, 0, 3],
    [-0.85, -1.2, 4],
    [0.1, -1.2, 5],
    [1.05, -1.2, 0],
    [-0.3, -2.4, 3],
    [0.6, -2.4, 1],
  ];
  stack.forEach(([bx, by, ci], i) => {
    // Each box does a little wobble as the kid lands in the stack.
    const wob = Math.sin(hit * 11 + i * 1.7) * Math.exp(-hit * 1.6) * 0.12;
    c.save();
    c.translate(bx * s, by * s);
    c.rotate(wob);
    c.fillStyle = BOXES[ci % BOXES.length];
    c.fillRect(-s * 0.42, -s * 1.1, s * 0.84, s * 1.1);
    c.strokeRect(-s * 0.42, -s * 1.1, s * 0.84, s * 1.1);
    c.fillStyle = '#fff6d8';
    c.beginPath();
    c.arc(0, -s * 0.62, s * 0.26, 0, Math.PI);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.fillRect(-s * 0.32, -s * 1.0, s * 0.64, s * 0.14);
    c.restore();
  });
  c.restore();
}

function drawCar(c: CanvasRenderingContext2D, x: number, y: number, s: number, now: number, dent: number): void {
  c.save();
  c.translate(x, y);
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  c.fillStyle = '#ffd23c';
  c.beginPath();
  c.moveTo(-s * 1.6, -s * 0.2);
  c.lineTo(-s * 1.6, -s * 0.75);
  c.lineTo(-s * 0.9, -s * 0.85);
  c.lineTo(-s * 0.45, -s * 1.5);
  c.lineTo(s * 0.7, -s * 1.5);
  c.lineTo(s * 1.15, -s * 0.85);
  c.lineTo(s * 1.65, -s * 0.75 + dent * s * 0.1);
  c.lineTo(s * 1.65 - dent * s * 0.15, -s * 0.2);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#bfe8ff';
  c.beginPath();
  c.moveTo(-s * 0.8, -s * 0.9);
  c.lineTo(-s * 0.42, -s * 1.38);
  c.lineTo(s * 0.0, -s * 1.38);
  c.lineTo(s * 0.0, -s * 0.9);
  c.closePath();
  c.moveTo(s * 0.15, -s * 0.9);
  c.lineTo(s * 0.15, -s * 1.38);
  c.lineTo(s * 0.64, -s * 1.38);
  c.lineTo(s * 1.0, -s * 0.9);
  c.closePath();
  c.fill();
  c.stroke();
  for (const wx of [-s * 0.95, s * 0.95]) {
    c.fillStyle = '#2a3342';
    c.beginPath();
    c.arc(wx, -s * 0.2, s * 0.38, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#cfd6e3';
    c.beginPath();
    c.arc(wx, -s * 0.2, s * 0.17, 0, TAU);
    c.fill();
  }
  // Hazard lights, blinking.
  if (dent > 0 && Math.floor(now / 220) % 2 === 0) {
    c.fillStyle = '#ff8a1f';
    c.beginPath();
    c.arc(-s * 1.6, -s * 0.55, s * 0.12, 0, TAU);
    c.arc(s * 1.62, -s * 0.55, s * 0.12, 0, TAU);
    c.fill();
  }
  // Bumper sticker.
  c.fillStyle = '#ffffff';
  c.fillRect(-s * 1.45, -s * 0.55, s * 0.6, s * 0.22);
  c.restore();
}

function drawGoose(c: CanvasRenderingContext2D, x: number, y: number, s: number, now: number, honk: number): void {
  c.save();
  c.translate(x, y);
  c.scale(-1, 1);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  const waddle = Math.sin(now * 0.02) * 0.12;
  // Legs and feet.
  c.strokeStyle = '#ff9a2e';
  c.lineWidth = Math.max(2, s * 0.12);
  for (const d of [-1, 1]) {
    c.beginPath();
    c.moveTo(d * s * 0.25, -s * 0.5);
    c.lineTo(d * s * 0.25 + waddle * d * s, -s * 0.02);
    c.lineTo(d * s * 0.25 + s * 0.3 + waddle * d * s, -s * 0.02);
    c.stroke();
  }
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  c.fillStyle = '#f7f7f2';
  c.beginPath();
  c.ellipse(0, -s * 0.85, s * 0.85, s * 0.55, -0.12, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#d7d9dd';
  c.beginPath();
  c.ellipse(-s * 0.15, -s * 0.8, s * 0.5, s * 0.28, -0.15, 0, TAU);
  c.fill();
  // Neck up and head, honking.
  c.strokeStyle = INK;
  c.lineWidth = Math.max(5, s * 0.34);
  c.beginPath();
  c.moveTo(s * 0.55, -s * 1.0);
  c.quadraticCurveTo(s * 0.85, -s * 1.5, s * 0.7, -s * 2.0 - honk * s * 0.1);
  c.stroke();
  c.strokeStyle = '#f7f7f2';
  c.lineWidth = Math.max(3.2, s * 0.22);
  c.stroke();
  const hx = s * 0.72;
  const hy = -s * 2.1 - honk * s * 0.1;
  c.fillStyle = '#f7f7f2';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  c.beginPath();
  c.arc(hx, hy, s * 0.3, 0, TAU);
  c.fill();
  c.stroke();
  // Beak: open when honking.
  c.fillStyle = '#ff9a2e';
  const open = honk * s * 0.16;
  c.beginPath();
  c.moveTo(hx + s * 0.22, hy - s * 0.1 - open);
  c.lineTo(hx + s * 0.78, hy - s * 0.02 - open);
  c.lineTo(hx + s * 0.25, hy + s * 0.04);
  c.closePath();
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(hx + s * 0.2, hy + s * 0.06);
  c.lineTo(hx + s * 0.7, hy + s * 0.08 + open);
  c.lineTo(hx + s * 0.22, hy + s * 0.2);
  c.closePath();
  c.fill();
  c.stroke();
  // Eye with attitude.
  c.fillStyle = INK;
  c.beginPath();
  c.arc(hx + s * 0.08, hy - s * 0.1, s * 0.06, 0, TAU);
  c.fill();
  c.lineWidth = Math.max(1.6, s * 0.09);
  c.beginPath();
  c.moveTo(hx - s * 0.08, hy - s * 0.25);
  c.lineTo(hx + s * 0.2, hy - s * 0.15);
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------------------

class CartScene implements ThemeScene {
  private off = 0;
  private wheel = 0;
  private roadOff = 0;
  private done = 0;
  private nextSpark = 0;
  private near: Near[] = [];
  private L = 900;

  constructor() {
    const r = lcg(31);
    const kinds: Near['kind'][] = ['tree', 'sale', 'tree', 'lamp', 'slow', 'tree', 'samples', 'lamp', 'hill', 'tree', 'goose', 'tree', 'deadend', 'lamp', 'tree'];
    let at = 40;
    for (const kind of kinds) {
      this.near.push({ at, kind, hue: Math.floor(r() * 3) });
      at += 90 + r() * 70;
    }
    this.L = at;
  }

  backdrop(f: Frame): void {
    const { c, W, H, now, dt, m } = f;
    const w = f.phase === 'betting' ? 0 : warp(m);
    const speed = f.phase === 'flying' ? 70 + w * 900 : f.phase === 'betting' ? 12 : 0;
    this.off += speed * dt;
    this.wheel += speed * dt * 0.05;
    this.roadOff += speed * dt * 1.6;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix('#4fb8ff', '#3a1a8c', w));
    g.addColorStop(0.7, mix('#bfeaff', '#d85cc8', w));
    g.addColorStop(1, mix('#eaf8ff', '#ff9a6a', w));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // The sun, which gets angrier.
    c.fillStyle = mix('#fff5b0', '#ffb04a', w);
    c.beginPath();
    c.arc(W * 0.82, H * 0.2, Math.min(W, H) * 0.09, 0, TAU);
    c.fill();
    // Clouds.
    c.fillStyle = `rgba(255,255,255,${0.85 - w * 0.45})`;
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 0.31 * W - this.off * 0.05 * (1 + i * 0.3)) % (W + 160) + W + 160) % (W + 160) - 80;
      const cy = H * (0.12 + (i % 3) * 0.1);
      const s = H * 0.05;
      c.beginPath();
      c.arc(cx, cy, s, 0, TAU);
      c.arc(cx + s * 1.1, cy + s * 0.2, s * 0.8, 0, TAU);
      c.arc(cx - s * 1.0, cy + s * 0.25, s * 0.7, 0, TAU);
      c.fill();
    }
    // Hills, far to near, each at its own pace.
    const layers: readonly [number, number, number, number, number][] = [
      [0.62, H * 0.1, 0.12, 0.004, 0],
      [0.72, H * 0.12, 0.3, 0.007, 2],
      [0.84, H * 0.13, 0.6, 0.012, 5],
    ];
    layers.forEach(([base, amp, par, freq, ph], i) => {
      c.fillStyle = mix(HILL[i], '#c14fb0', w * 0.5 * (1 - i * 0.2));
      hillPath(c, W, H, H * base, amp, this.off * par, freq, ph);
      c.fill();
    });
    // Streaming roadside things, on the near hill.
    const baseY = H * 0.9;
    const u = Math.max(9, Math.min(22, H * 0.05));
    const L = Math.max(this.L, W + 200);
    for (const n of this.near) {
      const x = ((((n.at - this.off) % L) + L) % L) - 60;
      if (x < -80 || x > W + 80) continue;
      if (n.kind === 'tree') drawTree(c, x, baseY, u * 1.2, n.hue);
      else if (n.kind === 'lamp') drawLamp(c, x, baseY, u);
      else drawSign(c, n.kind, x, baseY, u);
    }
    // The grass in front, and speed lines once it gets silly.
    c.fillStyle = mix('#3fa84a', '#a33aa0', w * 0.5);
    c.fillRect(0, H * 0.9, W, H * 0.1);
    if (f.phase === 'flying' && w > 0.05 && !f.calm) {
      c.strokeStyle = `rgba(255,255,255,${0.15 + w * 0.4})`;
      c.lineWidth = 1.5;
      const n = Math.floor(6 + w * 26);
      for (let i = 0; i < n; i++) {
        const k = (i * 0.6180339) % 1;
        const y = k * H;
        const len = 40 + w * 260 + k * 60;
        const x = ((((i * 173 - now * (0.6 + w * 3) * (0.5 + k)) % (W + len)) + W + len) % (W + len)) - len;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + len, y);
        c.stroke();
      }
    }
  }

  /** A stretch of road under the cart, sloping down to the right. */
  private road(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    c.save();
    c.translate(x, y);
    c.rotate(0.12);
    c.fillStyle = '#4b5565';
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1.4, s * 0.07);
    c.beginPath();
    c.roundRect(-s * 5.5, 0, s * 11, s * 0.5, s * 0.1);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffd23c';
    const per = s * 1.6;
    for (let i = -4; i <= 4; i++) {
      const dx = (((i * per - this.roadOff) % (per * 9)) + per * 9) % (per * 9) - per * 4.5;
      c.fillRect(dx, s * 0.2, s * 0.7, s * 0.07);
    }
    c.restore();
  }

  rider(f: RiderFrame): Anchor {
    const { c, now, phase } = f;
    const S = f.s * 1.6;
    const k: Kid = { face: 'wheee', arms: 'up', t: now, m: Math.max(1, f.m), legs: 0 };
    const lim = f.rightX - S * 7;
    if (phase === 'betting') {
      // Parked at the top of the hill, kid thumbs up and grinning, wheels chocked.
      const x = Math.min(f.padX + S * 1.5, lim);
      const y = f.padY - S * 0.4 + 0;
      this.road(c, x, y + S * 0.05, S);
      c.save();
      c.translate(x, y);
      c.rotate(0.12);
      k.arms = 'rim';
      k.face = 'smug';
      drawCart(c, S, 0, (cc) => {
        cc.save();
        cc.translate(S * 0.1, -S * 0.52);
        drawKid(cc, S * 0.95, k, false);
        cc.restore();
      });
      c.restore();
      return { x, y: y - S * 2 };
    }
    const cx = Math.min(f.tipX, lim);
    const cy = Math.max(f.tipY + S * 0.5, S * 3.6);
    if (phase === 'flying') {
      const jolt = f.calm ? 0 : Math.min(S * 0.07, S * 0.022 * Math.log2(f.m + 1));
      const x = cx;
      const y = cy + (Math.random() - 0.5) * jolt * 2 + Math.sin(now * 0.02) * jolt * 0.4;
      this.road(c, x, y + S * 0.05, S);
      c.save();
      c.translate(x, y);
      c.rotate(0.12 - Math.min(0.1, Math.log2(f.m) * 0.012));
      k.face = f.m > 40 ? 'oh' : 'wheee';
      k.arms = 'up';
      drawCart(c, S, this.wheel, (cc) => {
        cc.save();
        cc.translate(S * 0.1, -S * 0.52);
        drawKid(cc, S * 0.95, k);
        cc.restore();
      });
      c.restore();
      if (!f.calm && f.m > 4 && now > this.nextSpark) {
        this.nextSpark = now + Math.max(40, 220 - f.m * 3);
        f.puff(x - S * 0.7, y, -80 - Math.random() * 120, -60 - Math.random() * 90, 'dot', 450, 1.6 + Math.random() * 1.4, '#ffd36a', 360);
      }
      return { x, y: y - S * 2 };
    }
    return this.crash(f, S, cx, cy, k);
  }

  private crash(f: RiderFrame, S: number, cx: number, cy0: number, k: Kid): Anchor {
    const { c, now, variant } = f;
    // The cart falls with the line, and the act starts once it lands.
    const since = Math.max(0, f.since - 0.4);
    const cy = lerp(cy0, Math.max(cy0, f.floorY - S * 1.3), ease(f.plunge));
    if (since < 0.05) this.done = 0;
    const hitAt = 0.18;
    const sy = (x: number): number => cy + (x - cx) * 0.12 + S * 0.05;
    const ox = cx + S * (variant === 1 ? 3.6 : 3.0);
    const lxMax = f.rightX - S * 2.2;
    const lx = Math.min(variant === 1 ? ox + S * 4.6 : ox + S * 3.4, lxMax);
    const ly = sy(lx);
    const T = variant === 1 ? 1.3 : 1.05;
    const rawU = clamp((since - hitAt) / T);
    const u = ease(rawU * 0.5 + rawU * rawU * 0.5);
    const air = since >= hitAt;
    const peak = variant === 1 ? S * 4.4 : S * 3.0;
    // Kid: from the seat, up and over, down into the pile.
    const seatX = cx + S * 0.1;
    const seatY = cy - S * 1.1;
    const kx = air ? lerp(seatX, lx, rawU) : seatX;
    const ky = air ? lerp(seatY, ly - S * 0.4, rawU * rawU * 0.4 + rawU * 0.6) - Math.sin(rawU * Math.PI) * peak : seatY;
    const spin = air ? u * TAU * (variant === 2 ? 2.5 : 1.5) : 0;

    this.road(c, cx, cy + S * 0.05, S);
    // The obstacle and the landing: back layers.
    const grow = ease((since - 0.2) / 0.35);
    if (variant === 0) {
      c.fillStyle = '#b9c0cc';
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1.4, S * 0.07);
      c.beginPath();
      c.roundRect(ox - S * 0.4, sy(ox) - S * 0.62, S * 0.8, S * 0.7, S * 0.08);
      c.fill();
      c.stroke();
      c.fillStyle = '#ff4a3d';
      c.fillRect(ox - S * 0.4, sy(ox) - S * 0.62, S * 0.8, S * 0.14);
    } else if (variant === 1) {
      drawCar(c, ox + S * 0.2, sy(ox), S, now, clamp((since - hitAt) * 4));
      drawBoxes(c, lx, ly + S * 0.1, S * 0.9, grow, Math.max(0, since - hitAt - T));
    } else {
      const gx = ox - S * (0.2 + clamp((since - hitAt) * 2) * 0.2);
      drawGoose(c, gx, sy(ox), S * 1.1, now, since > hitAt - 0.1 ? 1 : 0);
    }
    if (variant !== 1) drawBush(c, lx, ly + S * 0.15, S * 0.9, grow, variant === 2, Math.max(0, since - hitAt - T));

    // The cart: stops dead, back wheels lift, then it rocks and settles.
    const tip = air ? Math.min(0.38, (since - hitAt) * 3.2) * Math.exp(-Math.max(0, since - hitAt - 0.3) * 2.2) : 0;
    const wob = air ? Math.sin(since * 14) * 0.05 * Math.exp(-(since - hitAt) * 2.5) : 0;
    c.save();
    c.translate(cx + S * 0.7, cy + S * 0.05);
    c.rotate(0.12 + tip + wob);
    c.translate(-S * 0.7, 0);
    drawCart(c, S, since < hitAt ? this.wheel : 0, (cc) => {
      if (!air) {
        cc.save();
        cc.translate(S * 0.1, -S * 0.52);
        k.face = 'oh';
        drawKid(cc, S * 0.95, k);
        cc.restore();
      }
    });
    c.restore();

    // Kid in the air, then in the pile.
    if (air) {
      const landed = rawU >= 1;
      c.save();
      if (landed && variant === 1) {
        // Perched on the cereal pile, helmet askew.
        c.translate(lx - S * 0.2, ly - S * 3.2);
        c.rotate(0.35 + Math.sin(since * 3) * 0.04);
      } else if (landed) {
        c.translate(lx, ly - S * 0.9);
        c.rotate(Math.PI * 0.82);
      } else {
        c.translate(kx, ky);
        c.rotate(spin);
      }
      k.face = landed ? 'dizzy' : 'oh';
      k.arms = 'out';
      k.legs = landed ? 0.2 : 1.6;
      drawKid(c, S * 0.95, k, !landed);
      c.restore();
    }
    // Bush front: hides most of the kid in the shrub.
    if (variant !== 1 && air) drawBush(c, lx + S * 0.1, ly + S * 0.55, S * 0.85, grow * (rawU >= 0.75 ? 1 : 0), variant === 2, Math.max(0, since - hitAt - T));

    // Effects, once each.
    if (air && !(this.done & 1)) {
      this.done |= 1;
      const text = variant === 0 ? 'THUNK!' : variant === 1 ? 'BONK!' : 'HONK!';
      f.puff(ox, cy - S * 2.4, 0, -40, 'text', 1000, S * 0.6, '#ffe45c', 0, text);
      for (let i = 0; i < (f.calm ? 4 : 14); i++) f.puff(ox - S * 0.4, cy - S * 0.2, (Math.random() - 0.2) * 280, -80 - Math.random() * 240, 'dot', 600, 2.4, '#ffd36a', 520);
    }
    if (rawU >= 1 && !(this.done & 2)) {
      this.done |= 2;
      const col = variant === 1 ? BOXES : variant === 2 ? ['#e8892b', '#f4b63a', '#d65a24'] : ['#46b85a', '#ff7fb0', '#2a8a45'];
      for (let i = 0; i < (f.calm ? 5 : 22); i++) f.puff(lx + (Math.random() - 0.5) * S * 2, ly - S, (Math.random() - 0.5) * 240, -120 - Math.random() * 220, variant === 1 ? 'stick' : 'flutter', 1100, 3.2, col[i % col.length], 520);
    }
    return { x: kx, y: ky };
  }
}

export const cart: Theme = {
  id: 'cart',
  name: 'Shopping Cart Hill',
  chip: 'Cart',
  icon: '🛒',
  blurb: 'A kid in a shopping cart on an endless hill',
  logo: ['Shopping Cart', 'Hill'],
  logoIcon: '🛒',
  themeColor: '#0b2b3d',
  css: {
    '--bg': '#0b2b3d',
    '--bg2': '#0f364c',
    '--panel': '#134561',
    '--panel2': '#1a577a',
    '--line': '#2b7ca6',
    '--hover': '#206892',
    '--text': '#f0fbff',
    '--muted': '#a8d4e8',
    '--green': '#7dffb0',
    '--green-deep': '#22b377',
    '--red': '#ff5a4d',
    '--gold': '#ffd23c',
    '--orange': '#ff9a2e',
    '--pink': '#ff7ab8',
    '--lemon': '#ffe45c',
    '--glow': '90, 220, 255',
    '--stage': '#12384f',
    '--bet-hi': '#bff3ff',
    '--bet-lo': '#17b4e0',
    '--bet-edge': '#0b7396',
    '--bet-ink': '#032a38',
    '--wait-hi': '#2b7ca6',
    '--wait-lo': '#1f6389',
    '--wait-edge': '#0d3a52',
    '--modal': '3, 18, 28',
  },
  ink: {
    grid: '200,235,255',
    label: '230,247,255',
    glow: 'rgba(110,225,255,0.3)',
    fillTop: 'rgba(120,225,255,0.3)',
    fillBottom: 'rgba(120,225,255,0.03)',
    crashFillTop: 'rgba(255,90,77,0.28)',
    crashFillBottom: 'rgba(255,90,77,0.02)',
    outline: 'rgba(8,30,48,0.8)',
    edge: true,
    caption: 'rgba(240,251,255,0.92)',
    win: '#7dffb0',
    lose: '#ff5a4d',
    cash: '#ffe45c',
    crashTitle: '#ff7a6a',
    crashSub: '#ffe3de',
    pinYou: '#7dffb0',
    pinYouText: '#032a18',
    pinYouBg: 'rgba(30,170,110,0.95)',
    pinBotText: '#e8f8ff',
    pinBotBg: 'rgba(12,50,72,0.88)',
    bar: ['#5ce0ff', '#ffe45c', '#ff7ab8'],
    flashMilestone: '255,235,150',
    flashCash: '125,255,176',
    flashCrash: '255,90,77',
    drain: '6,24,36',
  },
  fx: { confetti: ['#ff4a3d', '#ffd23c', '#3dc5ff', '#8be04a', '#ff8ad8'], burst: 'dot' },
  heat,
  launchLabel: 'GIVE IT A PUSH',
  milestones: {
    2: 'WHEEE',
    5: 'NO BRAKES',
    10: 'WHAT BRAKES?',
    25: 'THE CART IS HUMMING',
    50: 'SPEED OF SOUND',
    100: 'GOOSE CROSSING AHEAD',
    250: 'THE HILL IS ENDLESS',
    500: 'THE CART HAS OPINIONS',
    1000: 'SPEED OF PLOT',
  },
  readout: {
    label: 'SPEED',
    level: (m) => Math.round(3 * m ** 1.4),
    text: (level) => `${level.toLocaleString('en-US')} MPH`,
  },
  crashName: 'Wipeout',
  crashedVerb: 'wiped out',
  crashes: [
    { title: 'CURBED', caption: 'The curb was not on the map. Shrub: soft.', sound: 'tumble' },
    { title: 'FENDER BENDER', caption: 'Parked car, cereal aisle. Mostly fine.', sound: 'clack' },
    { title: 'HONK!', caption: 'The goose owns this hill.', sound: 'honk' },
  ],
  crowd: [
    'CartWheelCarl',
    'AisleSix',
    'CouponKing',
    'WheeeWendy',
    'BrakelessBen',
    'ParkingLotPete',
    'CerealKiller',
    'SamplesSam',
    'GooseWhisperer',
    'HillBilly',
    'DownhillDan',
    'WobblyWheel',
    'ExpressLane',
    'ClearanceCarla',
    'TenItemsOrLess',
    'CartCorralKid',
    'BagItYourself',
    'BulkBuyBrenda',
    'CurbAppeal',
    'ShrubHugger',
    'HelmetHead',
    'TurboTrolley',
    'GravityGary',
    'SlopeSlider',
    'LoyaltyCardLou',
    'FreeSampleFay',
    'LostInAisleNine',
    'WetFloorWill',
    'BreadAndButter',
    'RollbackRita',
    'ReceiptRay',
    'PriceCheckPaul',
    'ProduceMisting',
    'DoubleBaggedDee',
    'KartKid',
    'FastLaneFinn',
    'TrolleyTrixie',
    'ZoomerZed',
    'CheckoutChad',
    'MegaMartMolly',
  ],
  refill: { who: 'Sample Lady Sue', quip: 'Take a few, hon. They’re free. Mostly.', stat: 'Coins from Sample Lady Sue' },
  help: {
    eyebrow: 'No brakes. No notes.',
    story:
      'A kid, a shopping cart and a very long hill. Every round the cart picks up speed and the multiplier climbs from 1.00× with it. Somewhere down the slope there is a curb, a parked car or a goose, and nobody knows which, or when. Cash out before it happens and you win your bet times the multiplier. Wait too long and you get a face full of shrubbery.',
    back: 'Back to the hill',
  },
  sound: {
    whine: { type: 'triangle', base: 260, slope: 0.6 },
    beat: { freq: 100, bpm: 110, slope: 24 },
    launch: 'rattle',
    milestone: { wave: 'triangle', base: 523, ratios: [1, 1.25, 1.5, 2], step: 0.055 },
  },
  scene: () => new CartScene(),
};
