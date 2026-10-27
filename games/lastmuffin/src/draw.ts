// Every drawing in the game, in code: the muffins, the pests, the pickups and
// what the weapons look like. Each draws around (0, 0) at size `s` (about the
// thing's radius in world units), facing right; the view flips and caches
// them. Side-on, cartoon outlines, warm bakery colors.
import type { EnemyId, MuffinDef, WeaponId } from './defs';

type Ctx = CanvasRenderingContext2D;

export const INK = '#2a1a12';
const TAU = Math.PI * 2;

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

function fillStroke(c: Ctx, fill: string, line = 0.09, s = 1): void {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = Math.max(1, line * s);
  c.strokeStyle = INK;
  c.stroke();
}

function eye(c: Ctx, x: number, y: number, r: number, look = 0.3, angry = false): void {
  ellipse(c, x, y, r, r * 1.1);
  c.fillStyle = '#fff';
  c.fill();
  c.lineWidth = Math.max(1, r * 0.3);
  c.strokeStyle = INK;
  c.stroke();
  ellipse(c, x + r * look, y + r * 0.1, r * 0.55, r * 0.6);
  c.fillStyle = INK;
  c.fill();
  if (angry) {
    c.beginPath();
    c.moveTo(x - r * 1.2, y - r * 1.5);
    c.lineTo(x + r * 1.1, y - r * 0.7);
    c.lineWidth = Math.max(1, r * 0.45);
    c.stroke();
  }
}

/** A fixed scatter of points in the unit circle, the same every time. */
function scatter(n: number, seed: number): [number, number][] {
  let a = seed;
  const r = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  return Array.from({ length: n }, () => {
    const t = r() * TAU;
    const d = Math.sqrt(r());
    return [Math.cos(t) * d, Math.sin(t) * d] as [number, number];
  });
}

// ---------------------------------------------------------------------------
// Muffins

export type MuffinFace = 'happy' | 'hurt' | 'dead' | 'bonk';

/** A muffin standing on the floor at y = s: paper liner, a big muffin top, little legs. */
export function drawMuffin(c: Ctx, s: number, m: Pick<MuffinDef, 'liner' | 'top' | 'spots' | 'id'>, frame = 0, face: MuffinFace = 'happy'): void {
  const step = frame % 2 === 0 ? 1 : -1;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // Legs.
  c.strokeStyle = INK;
  c.lineWidth = s * 0.13;
  for (const [lx, k] of [
    [-0.32, step],
    [0.32, -step],
  ]) {
    c.beginPath();
    c.moveTo(lx * s, s * 0.7);
    c.lineTo(lx * s + k * s * 0.12, s * 1.05);
    c.stroke();
    ellipse(c, lx * s + k * s * 0.12 + s * 0.08, s * 1.07, s * 0.16, s * 0.08);
    c.fillStyle = INK;
    c.fill();
  }
  // Arms.
  c.lineWidth = s * 0.11;
  c.beginPath();
  c.moveTo(-s * 0.7, s * 0.15);
  c.lineTo(-s * 1.0, s * (0.35 + step * 0.08));
  c.moveTo(s * 0.7, s * 0.15);
  c.lineTo(s * 1.0, s * (0.35 - step * 0.08));
  c.stroke();
  // The paper liner, pleated.
  c.beginPath();
  c.moveTo(-s * 0.82, -s * 0.05);
  c.lineTo(s * 0.82, -s * 0.05);
  c.lineTo(s * 0.6, s * 0.78);
  c.lineTo(-s * 0.6, s * 0.78);
  c.closePath();
  fillStroke(c, m.liner, 0.09, s);
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.18)';
  c.lineWidth = Math.max(1, s * 0.05);
  for (let i = -3; i <= 3; i++) {
    c.beginPath();
    c.moveTo(i * s * 0.24, -s * 0.05);
    c.lineTo(i * s * 0.17, s * 0.8);
    c.stroke();
  }
  c.restore();
  // The muffin top, overhanging the liner.
  c.beginPath();
  c.moveTo(-s * 0.98, s * 0.02);
  c.bezierCurveTo(-s * 1.15, -s * 0.55, -s * 0.6, -s * 1.05, 0, -s * 1.02);
  c.bezierCurveTo(s * 0.6, -s * 1.05, s * 1.15, -s * 0.55, s * 0.98, s * 0.02);
  c.quadraticCurveTo(0, s * 0.18, -s * 0.98, s * 0.02);
  c.closePath();
  fillStroke(c, m.top, 0.09, s);
  // A highlight, and the spots: blueberries, chips, seeds.
  ellipse(c, -s * 0.35, -s * 0.68, s * 0.3, s * 0.12, -0.4);
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.fill();
  const seeds = m.id === 'lemon' ? 14 : m.id === 'corn' ? 0 : 7;
  for (const [px, py] of scatter(seeds, m.id.length * 97 + 11)) {
    const x = px * s * 0.72;
    const y = -s * 0.5 + py * s * 0.38;
    if (m.id === 'lemon') {
      ellipse(c, x, y, s * 0.04, s * 0.06);
    } else {
      ellipse(c, x, y, s * 0.12, s * 0.1);
    }
    c.fillStyle = m.spots;
    c.fill();
  }
  if (m.id === 'corn') {
    c.strokeStyle = m.spots;
    c.lineWidth = Math.max(1, s * 0.05);
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.arc(i * s * 0.3, -s * 0.4, s * 0.18, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
  }
  if (m.id === 'banana') {
    // A walnut on top.
    ellipse(c, s * 0.1, -s * 1.0, s * 0.22, s * 0.16);
    fillStroke(c, '#8a5a32', 0.06, s);
  }
  // The face, on the liner.
  if (face === 'dead') {
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1, s * 0.08);
    for (const ex of [-0.28, 0.28]) {
      c.beginPath();
      c.moveTo(ex * s - s * 0.1, s * 0.2);
      c.lineTo(ex * s + s * 0.1, s * 0.4);
      c.moveTo(ex * s + s * 0.1, s * 0.2);
      c.lineTo(ex * s - s * 0.1, s * 0.4);
      c.stroke();
    }
  } else {
    const squint = face === 'hurt';
    for (const ex of [-0.26, 0.3]) {
      if (squint) {
        c.strokeStyle = INK;
        c.lineWidth = Math.max(1, s * 0.08);
        c.beginPath();
        c.moveTo(ex * s - s * 0.1, s * 0.24);
        c.lineTo(ex * s + s * 0.08, s * 0.3);
        c.lineTo(ex * s - s * 0.1, s * 0.36);
        c.stroke();
      } else {
        eye(c, ex * s, s * 0.28, s * 0.12, 0.35);
      }
    }
  }
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1, s * 0.07);
  c.beginPath();
  if (face === 'bonk') {
    ellipse(c, s * 0.03, s * 0.56, s * 0.12, s * 0.1);
    c.fillStyle = INK;
    c.fill();
  } else if (face === 'hurt' || face === 'dead') {
    c.moveTo(-s * 0.12, s * 0.58);
    c.quadraticCurveTo(s * 0.02, s * 0.48, s * 0.16, s * 0.58);
    c.stroke();
  } else {
    c.moveTo(-s * 0.14, s * 0.5);
    c.quadraticCurveTo(s * 0.02, s * 0.64, s * 0.18, s * 0.5);
    c.stroke();
  }
  // Rosy cheeks.
  c.fillStyle = 'rgba(255,110,140,0.35)';
  ellipse(c, -s * 0.46, s * 0.46, s * 0.1, s * 0.06);
  c.fill();
  ellipse(c, s * 0.5, s * 0.46, s * 0.1, s * 0.06);
  c.fill();
}

// ---------------------------------------------------------------------------
// Pests

function legs(c: Ctx, s: number, xs: number[], y: number, len: number, frame: number): void {
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1, s * 0.12);
  xs.forEach((x, i) => {
    const k = (i + frame) % 2 === 0 ? 1 : -1;
    c.beginPath();
    c.moveTo(x * s, y * s);
    c.lineTo(x * s + k * s * 0.25, (y + len) * s);
    c.stroke();
  });
}

function crown(c: Ctx, x: number, y: number, w: number): void {
  c.beginPath();
  c.moveTo(x - w, y);
  c.lineTo(x - w, y - w * 0.9);
  c.lineTo(x - w * 0.5, y - w * 0.45);
  c.lineTo(x, y - w * 1.1);
  c.lineTo(x + w * 0.5, y - w * 0.45);
  c.lineTo(x + w, y - w * 0.9);
  c.lineTo(x + w, y);
  c.closePath();
  fillStroke(c, '#ffd34d', 0.08, w);
  ellipse(c, x, y - w * 0.4, w * 0.16, w * 0.16);
  c.fillStyle = '#e8443a';
  c.fill();
}

function ant(c: Ctx, s: number, frame: number, body = '#2b211d', queen = false): void {
  legs(c, s, [-0.4, 0, 0.35], 0.2, 0.55, frame);
  ellipse(c, -0.75 * s, 0, 0.55 * s, 0.42 * s);
  fillStroke(c, queen ? '#a33a2a' : body, 0.12, s);
  ellipse(c, 0, 0.02 * s, 0.32 * s, 0.28 * s);
  fillStroke(c, body, 0.12, s);
  ellipse(c, 0.62 * s, -0.12 * s, 0.38 * s, 0.34 * s);
  fillStroke(c, body, 0.12, s);
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1, s * 0.1);
  c.beginPath();
  c.moveTo(0.8 * s, -0.4 * s);
  c.quadraticCurveTo(1.0 * s, -0.95 * s, 1.3 * s, -0.8 * s);
  c.stroke();
  ellipse(c, 0.75 * s, -0.18 * s, 0.1 * s, 0.1 * s);
  c.fillStyle = '#fff';
  c.fill();
  if (queen) crown(c, 0.6 * s, -0.42 * s, 0.32 * s);
}

function fly(c: Ctx, s: number, frame: number): void {
  const up = frame % 2 === 0;
  c.globalAlpha = 0.7;
  ellipse(c, -0.1 * s, (up ? -0.75 : -0.45) * s, 0.55 * s, 0.3 * s, up ? -0.5 : -0.2);
  fillStroke(c, '#dfe8ff', 0.06, s);
  c.globalAlpha = 1;
  ellipse(c, 0, 0, 0.7 * s, 0.48 * s);
  fillStroke(c, '#c9a36a', 0.12, s);
  c.strokeStyle = 'rgba(42,26,18,0.6)';
  c.lineWidth = Math.max(1, s * 0.1);
  for (const x of [-0.35, -0.1]) {
    c.beginPath();
    c.moveTo(x * s, -0.4 * s);
    c.lineTo(x * s, 0.4 * s);
    c.stroke();
  }
  ellipse(c, 0.55 * s, -0.12 * s, 0.3 * s, 0.32 * s);
  fillStroke(c, '#d93a2a', 0.1, s);
}

function mouse(c: Ctx, s: number, frame: number, fur = '#9a96a0', king = false): void {
  // Tail.
  c.strokeStyle = '#e8a0a8';
  c.lineWidth = Math.max(1, s * 0.1);
  c.beginPath();
  c.moveTo(-0.85 * s, 0.1 * s);
  c.bezierCurveTo(-1.4 * s, 0, -1.3 * s, -0.7 * s, -1.6 * s, (frame % 2 ? -0.5 : -0.8) * s);
  c.stroke();
  legs(c, s, [-0.45, 0.35], 0.35, 0.35, frame);
  ellipse(c, -0.1 * s, 0.05 * s, 0.85 * s, 0.55 * s);
  fillStroke(c, fur, 0.1, s);
  // Head.
  c.beginPath();
  c.moveTo(0.35 * s, -0.4 * s);
  c.quadraticCurveTo(1.2 * s, -0.25 * s, 1.15 * s, 0.1 * s);
  c.quadraticCurveTo(0.8 * s, 0.35 * s, 0.35 * s, 0.3 * s);
  c.closePath();
  fillStroke(c, fur, 0.1, s);
  ellipse(c, 1.15 * s, 0.05 * s, 0.1 * s, 0.1 * s);
  c.fillStyle = '#ff8fa8';
  c.fill();
  ellipse(c, 0.35 * s, -0.5 * s, 0.3 * s, 0.32 * s);
  fillStroke(c, fur, 0.1, s);
  ellipse(c, 0.35 * s, -0.5 * s, 0.16 * s, 0.18 * s);
  c.fillStyle = '#ffb0c0';
  c.fill();
  ellipse(c, 0.72 * s, -0.12 * s, 0.08 * s, 0.09 * s);
  c.fillStyle = INK;
  c.fill();
  if (king) {
    crown(c, 0.4 * s, -0.78 * s, 0.32 * s);
    // A little red cape.
    c.beginPath();
    c.moveTo(0.1 * s, -0.35 * s);
    c.quadraticCurveTo(-0.6 * s, -0.5 * s, -0.95 * s, 0.25 * s);
    c.lineTo(-0.2 * s, 0.2 * s);
    c.closePath();
    fillStroke(c, '#b02a3a', 0.07, s);
  }
}

function roach(c: Ctx, s: number, frame: number): void {
  legs(c, s, [-0.5, -0.05, 0.4], 0.2, 0.5, frame);
  ellipse(c, -0.1 * s, 0, 0.95 * s, 0.5 * s);
  fillStroke(c, '#6b3a1c', 0.1, s);
  ellipse(c, -0.3 * s, -0.18 * s, 0.5 * s, 0.14 * s, -0.1);
  c.fillStyle = 'rgba(255,220,180,0.35)';
  c.fill();
  c.strokeStyle = 'rgba(42,26,18,0.6)';
  c.lineWidth = Math.max(1, s * 0.07);
  c.beginPath();
  c.moveTo(-0.95 * s, 0);
  c.lineTo(0.55 * s, 0);
  c.stroke();
  ellipse(c, 0.8 * s, 0.05 * s, 0.28 * s, 0.3 * s);
  fillStroke(c, '#4a2612', 0.1, s);
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1, s * 0.06);
  c.beginPath();
  c.moveTo(0.95 * s, -0.15 * s);
  c.quadraticCurveTo(1.6 * s, -0.9 * s, 2.0 * s, (frame % 2 ? -0.6 : -0.75) * s);
  c.moveTo(0.95 * s, -0.1 * s);
  c.quadraticCurveTo(1.5 * s, -0.5 * s, 1.95 * s, (frame % 2 ? -0.2 : -0.35) * s);
  c.stroke();
}

function bird(c: Ctx, s: number, frame: number, body: string, wing: string, neck: string | null, beak: string, angry: boolean): void {
  const up = frame % 2 === 0;
  // Tail.
  c.beginPath();
  c.moveTo(-0.7 * s, -0.1 * s);
  c.lineTo(-1.35 * s, -0.3 * s);
  c.lineTo(-1.3 * s, 0.15 * s);
  c.closePath();
  fillStroke(c, wing, 0.08, s);
  ellipse(c, -0.05 * s, 0.05 * s, 0.9 * s, 0.55 * s);
  fillStroke(c, body, 0.09, s);
  if (neck) {
    ellipse(c, 0.45 * s, -0.15 * s, 0.32 * s, 0.4 * s, 0.3);
    c.fillStyle = neck;
    c.fill();
  }
  ellipse(c, 0.72 * s, -0.42 * s, 0.38 * s, 0.36 * s);
  fillStroke(c, body, 0.09, s);
  c.beginPath();
  c.moveTo(1.02 * s, -0.48 * s);
  c.lineTo(1.45 * s, -0.36 * s);
  c.lineTo(1.02 * s, -0.28 * s);
  c.closePath();
  fillStroke(c, beak, 0.06, s);
  eye(c, 0.82 * s, -0.5 * s, 0.1 * s, 0.4, angry);
  // The wing, flapping.
  c.beginPath();
  c.moveTo(-0.3 * s, -0.1 * s);
  if (up) c.quadraticCurveTo(-0.2 * s, -1.3 * s, 0.5 * s, -0.95 * s);
  else c.quadraticCurveTo(0, 0.7 * s, 0.55 * s, 0.25 * s);
  c.quadraticCurveTo(0.3 * s, -0.1 * s, -0.3 * s, -0.1 * s);
  fillStroke(c, wing, 0.08, s);
}

function mold(c: Ctx, s: number, frame: number): void {
  const wob = frame % 2 ? 0.05 : -0.05;
  c.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * TAU;
    const r = s * (0.95 + (i % 2 ? 0.12 : -0.04) + Math.sin(a * 3) * wob);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.85;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  fillStroke(c, '#7aa83a', 0.08, s);
  for (const [px, py] of scatter(6, 5)) {
    ellipse(c, px * s * 0.6, py * s * 0.5, s * 0.16, s * 0.13);
    c.fillStyle = '#b5e33b';
    c.fill();
  }
  for (const [px, py] of scatter(4, 9)) {
    ellipse(c, px * s * 0.6, py * s * 0.5, s * 0.1, s * 0.08);
    c.fillStyle = '#4a6a1c';
    c.fill();
  }
  eye(c, 0.15 * s, -0.15 * s, 0.16 * s, 0.4, true);
  eye(c, 0.55 * s, -0.12 * s, 0.14 * s, 0.4, true);
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1, s * 0.08);
  c.beginPath();
  c.moveTo(0.15 * s, 0.25 * s);
  c.quadraticCurveTo(0.38 * s, 0.12 * s, 0.6 * s, 0.25 * s);
  c.stroke();
}

function raccoon(c: Ctx, s: number, frame: number): void {
  // Ringed tail.
  c.save();
  c.translate(-0.85 * s, -0.1 * s);
  c.rotate(frame % 2 ? -0.5 : -0.65);
  ellipse(c, -0.45 * s, 0, 0.55 * s, 0.22 * s);
  fillStroke(c, '#8f8a92', 0.07, s);
  c.fillStyle = '#3a3438';
  for (const x of [-0.7, -0.4, -0.12]) {
    c.fillRect(x * s, -0.2 * s, 0.1 * s, 0.4 * s);
  }
  c.restore();
  legs(c, s, [-0.5, -0.2, 0.25, 0.5], 0.35, 0.4, frame);
  ellipse(c, -0.05 * s, 0.05 * s, 0.85 * s, 0.55 * s);
  fillStroke(c, '#8f8a92', 0.08, s);
  // Head with the mask.
  ellipse(c, 0.65 * s, -0.4 * s, 0.45 * s, 0.4 * s);
  fillStroke(c, '#a9a4ac', 0.08, s);
  for (const ex of [0.4, 0.82]) {
    ellipse(c, ex * s, -0.85 * s, 0.13 * s, 0.15 * s);
    fillStroke(c, '#8f8a92', 0.07, s);
  }
  c.beginPath();
  c.moveTo(0.3 * s, -0.5 * s);
  c.quadraticCurveTo(0.65 * s, -0.7 * s, 1.0 * s, -0.48 * s);
  c.quadraticCurveTo(0.65 * s, -0.28 * s, 0.3 * s, -0.42 * s);
  c.fillStyle = '#2a2428';
  c.fill();
  eye(c, 0.55 * s, -0.48 * s, 0.08 * s, 0.4);
  eye(c, 0.82 * s, -0.47 * s, 0.08 * s, 0.4);
  ellipse(c, 1.08 * s, -0.32 * s, 0.09 * s, 0.08 * s);
  c.fillStyle = INK;
  c.fill();
}

function toaster(c: Ctx, s: number, frame: number): void {
  legs(c, s, [-0.5, 0.5], 0.6, 0.35, frame);
  // Toast sticking out.
  for (const x of [-0.35, 0.25]) {
    c.beginPath();
    c.roundRect((x - 0.18) * s, -(0.95 + (frame % 2 ? 0.05 : 0)) * s, 0.42 * s, 0.5 * s, 0.1 * s);
    fillStroke(c, '#c98a4b', 0.06, s);
  }
  c.beginPath();
  c.roundRect(-0.9 * s, -0.6 * s, 1.8 * s, 1.25 * s, 0.25 * s);
  const g = c.createLinearGradient(0, -0.6 * s, 0, 0.65 * s);
  g.addColorStop(0, '#e9edf2');
  g.addColorStop(1, '#9aa2ac');
  c.fillStyle = g;
  c.fill();
  c.lineWidth = Math.max(1, s * 0.07);
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = INK;
  for (const x of [-0.35, 0.25]) c.fillRect((x - 0.2) * s, -0.62 * s, 0.46 * s, 0.08 * s);
  // The lever.
  c.fillRect(0.9 * s, -0.1 * s, 0.22 * s, 0.12 * s);
  eye(c, -0.25 * s, -0.05 * s, 0.14 * s, 0.4, true);
  eye(c, 0.3 * s, -0.05 * s, 0.14 * s, 0.4, true);
  c.beginPath();
  c.moveTo(-0.3 * s, 0.35 * s);
  for (let i = 0; i <= 6; i++) c.lineTo((-0.3 + i * 0.1) * s, (0.35 + (i % 2 ? 0.08 : 0)) * s);
  c.lineWidth = Math.max(1, s * 0.06);
  c.stroke();
}

/** A pest, facing right. */
export function drawEnemy(c: Ctx, id: EnemyId, s: number, frame: number): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  switch (id) {
    case 'ant':
      return ant(c, s, frame);
    case 'queen':
      return ant(c, s, frame, '#3a2a24', true);
    case 'fly':
      return fly(c, s, frame);
    case 'mouse':
      return mouse(c, s, frame);
    case 'ratking':
      return mouse(c, s, frame, '#7a5a42', true);
    case 'roach':
      return roach(c, s, frame);
    case 'pigeon':
      return bird(c, s, frame, '#8d97ad', '#6c7690', '#6aa88a', '#e0a050', false);
    case 'seagull':
      return bird(c, s, frame, '#f4f4f0', '#a9b2bc', null, '#f2c230', true);
    case 'mold':
    case 'moldling':
      return mold(c, s, frame);
    case 'raccoon':
      return raccoon(c, s, frame);
    case 'toaster':
      return toaster(c, s, frame);
  }
}

// ---------------------------------------------------------------------------
// Pickups and weapons

export function drawSprinkle(c: Ctx, s: number, color: string, angle: number): void {
  c.save();
  c.rotate(angle);
  c.beginPath();
  c.roundRect(-s, -s * 0.38, s * 2, s * 0.76, s * 0.38);
  c.fillStyle = color;
  c.fill();
  c.lineWidth = Math.max(1, s * 0.22);
  c.strokeStyle = INK;
  c.stroke();
  c.beginPath();
  c.roundRect(-s * 0.6, -s * 0.22, s * 0.9, s * 0.18, s * 0.09);
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fill();
  c.restore();
}

export function drawCrumb(c: Ctx, s: number): void {
  c.beginPath();
  c.moveTo(-s, -s * 0.2);
  c.lineTo(-s * 0.3, -s * 0.9);
  c.lineTo(s * 0.8, -s * 0.6);
  c.lineTo(s, s * 0.4);
  c.lineTo(s * 0.1, s * 0.9);
  c.lineTo(-s * 0.8, s * 0.6);
  c.closePath();
  fillStroke(c, '#e3a64f', 0.16, s);
  ellipse(c, -s * 0.2, -s * 0.3, s * 0.3, s * 0.18, -0.4);
  c.fillStyle = '#ffd38a';
  c.fill();
}

export function drawMilk(c: Ctx, s: number): void {
  c.beginPath();
  c.moveTo(-s * 0.6, -s * 0.9);
  c.lineTo(s * 0.6, -s * 0.9);
  c.lineTo(s * 0.5, s * 0.9);
  c.lineTo(-s * 0.5, s * 0.9);
  c.closePath();
  fillStroke(c, '#ffffff', 0.12, s);
  c.fillStyle = '#7cc8ff';
  c.fillRect(-s * 0.52, -s * 0.1, s * 1.04, s * 0.25);
  c.beginPath();
  c.moveTo(-s * 0.5, -s * 0.6);
  c.lineTo(s * 0.5, -s * 0.6);
  c.lineTo(s * 0.45, s * 0.85);
  c.lineTo(-s * 0.45, s * 0.85);
  c.closePath();
  c.fillStyle = 'rgba(240,248,255,0.9)';
  c.fill();
}

export function drawMagnet(c: Ctx, s: number): void {
  c.lineCap = 'butt';
  c.strokeStyle = INK;
  c.lineWidth = s * 0.75;
  c.beginPath();
  c.arc(0, 0, s * 0.6, Math.PI, 0, true);
  c.stroke();
  c.strokeStyle = '#e8443a';
  c.lineWidth = s * 0.5;
  c.beginPath();
  c.arc(0, 0, s * 0.6, Math.PI, 0, true);
  c.stroke();
  c.fillStyle = '#d8dde6';
  c.fillRect(-s * 0.85, -s * 0.3, s * 0.5, s * 0.3);
  c.fillRect(s * 0.35, -s * 0.3, s * 0.5, s * 0.3);
}

/** The pie tin a boss leaves behind. */
export function drawChest(c: Ctx, s: number, t: number): void {
  const glow = c.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 2);
  glow.addColorStop(0, `rgba(255,211,77,${0.45 + Math.sin(t * 0.006) * 0.15})`);
  glow.addColorStop(1, 'rgba(255,211,77,0)');
  c.fillStyle = glow;
  c.fillRect(-s * 2, -s * 2, s * 4, s * 4);
  ellipse(c, 0, s * 0.25, s * 1.1, s * 0.5);
  fillStroke(c, '#b8c0ca', 0.1, s);
  ellipse(c, 0, 0, s * 0.95, s * 0.42);
  fillStroke(c, '#e8a85a', 0.1, s);
  c.save();
  ellipse(c, 0, 0, s * 0.95, s * 0.42);
  c.clip();
  c.strokeStyle = '#c47a32';
  c.lineWidth = s * 0.12;
  for (let i = -3; i <= 3; i++) {
    c.beginPath();
    c.moveTo(i * s * 0.3 - s * 0.3, -s * 0.5);
    c.lineTo(i * s * 0.3 + s * 0.3, s * 0.5);
    c.moveTo(i * s * 0.3 + s * 0.3, -s * 0.5);
    c.lineTo(i * s * 0.3 - s * 0.3, s * 0.5);
    c.stroke();
  }
  c.restore();
}

export function drawBerry(c: Ctx, s: number, color = '#4f6bd8'): void {
  ellipse(c, 0, 0, s, s);
  fillStroke(c, color, 0.2, s);
  ellipse(c, -s * 0.3, -s * 0.3, s * 0.3, s * 0.25);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fill();
  c.strokeStyle = '#1c2050';
  c.lineWidth = Math.max(1, s * 0.18);
  c.beginPath();
  c.moveTo(s * 0.35, -s * 0.85);
  c.lineTo(s * 0.55, -s * 0.5);
  c.moveTo(s * 0.7, -s * 0.75);
  c.lineTo(s * 0.4, -s * 0.55);
  c.stroke();
}

export function drawToast(c: Ctx, s: number): void {
  c.beginPath();
  c.moveTo(-s, s * 0.9);
  c.lineTo(-s, -s * 0.2);
  c.quadraticCurveTo(-s * 1.1, -s, -s * 0.4, -s);
  c.quadraticCurveTo(0, -s * 1.25, s * 0.4, -s);
  c.quadraticCurveTo(s * 1.1, -s, s, -s * 0.2);
  c.lineTo(s, s * 0.9);
  c.closePath();
  fillStroke(c, '#7a4a22', 0.14, s);
  c.beginPath();
  c.roundRect(-s * 0.72, -s * 0.6, s * 1.44, s * 1.3, s * 0.3);
  c.fillStyle = '#e0b070';
  c.fill();
}

export function drawPin(c: Ctx, s: number, color = '#c98a4b'): void {
  c.beginPath();
  c.roundRect(-s * 0.75, -s * 0.28, s * 1.5, s * 0.56, s * 0.22);
  fillStroke(c, color, 0.1, s);
  for (const k of [-1, 1]) {
    c.beginPath();
    c.roundRect(k > 0 ? s * 0.75 : -s * 1.15, -s * 0.12, s * 0.4, s * 0.24, s * 0.1);
    fillStroke(c, '#8a5a32', 0.08, s);
  }
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fillRect(-s * 0.6, -s * 0.18, s * 1.2, s * 0.1);
}

export function drawKnife(c: Ctx, s: number, color = '#d8dde6'): void {
  c.beginPath();
  c.moveTo(-s * 0.2, -s * 0.16);
  c.lineTo(s * 0.9, -s * 0.12);
  c.quadraticCurveTo(s * 1.15, 0, s * 0.9, s * 0.16);
  c.lineTo(-s * 0.2, s * 0.16);
  c.closePath();
  fillStroke(c, color, 0.08, s);
  c.beginPath();
  c.roundRect(-s * 0.95, -s * 0.14, s * 0.8, s * 0.28, s * 0.12);
  fillStroke(c, '#f2e2a8', 0.08, s);
}

/** A weapon's little picture for menus and the HUD. */
export function drawWeaponIcon(c: Ctx, id: WeaponId, s: number, evolved: boolean, color: string): void {
  switch (id) {
    case 'blaster':
      drawBerry(c, s * 0.55, color);
      break;
    case 'knives':
      c.rotate(-0.6);
      drawKnife(c, s * 0.8, evolved ? '#f2e2a8' : '#d8dde6');
      break;
    case 'burst':
      for (let i = 0; i < 6; i++) {
        c.save();
        const a = (i / 6) * TAU;
        c.translate(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55);
        drawCrumb(c, s * 0.18);
        c.restore();
      }
      drawCrumb(c, s * 0.28);
      break;
    case 'coffee':
      c.beginPath();
      c.roundRect(-s * 0.5, -s * 0.35, s * 0.8, s * 0.85, s * 0.12);
      fillStroke(c, evolved ? '#3a2416' : '#ffffff', 0.1, s);
      c.beginPath();
      c.arc(s * 0.35, s * 0.05, s * 0.2, -Math.PI / 2, Math.PI / 2);
      c.lineWidth = s * 0.1;
      c.stroke();
      c.strokeStyle = 'rgba(200,200,210,0.9)';
      c.lineWidth = s * 0.08;
      for (const x of [-0.25, 0.05]) {
        c.beginPath();
        c.moveTo(x * s, -s * 0.45);
        c.quadraticCurveTo((x + 0.15) * s, -s * 0.65, x * s, -s * 0.85);
        c.stroke();
      }
      break;
    case 'pin':
      c.rotate(-0.6);
      drawPin(c, s * 0.62, color);
      break;
    case 'sprinkles':
      ['#ff6fa8', '#7cc8ff', '#ffd34d', '#b5e33b', '#c58aff'].forEach((col, i) => {
        c.save();
        c.translate((i - 2) * s * 0.28, Math.sin(i * 2.3) * s * 0.3);
        drawSprinkle(c, s * 0.2, col, 0.8 + i);
        c.restore();
      });
      break;
    case 'whisk':
      c.rotate(-0.7);
      c.strokeStyle = evolved ? '#ff9a2e' : '#c9ccd6';
      c.lineWidth = s * 0.08;
      for (const k of [-1, -0.4, 0.4, 1]) {
        c.beginPath();
        c.ellipse(s * 0.2, 0, s * 0.6, s * 0.3 * Math.abs(k), 0, 0, TAU);
        c.stroke();
      }
      c.beginPath();
      c.roundRect(-s * 0.85, -s * 0.1, s * 0.5, s * 0.2, s * 0.08);
      fillStroke(c, '#e8443a', 0.06, s);
      break;
    case 'frosting':
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * TAU;
        const r = s * (0.55 + (i % 2 ? 0.1 : 0));
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8);
      }
      c.closePath();
      fillStroke(c, color, 0.08, s);
      ['#ff6fa8', '#7cc8ff', '#ffd34d'].forEach((col, i) => {
        c.save();
        c.translate((i - 1) * s * 0.25, (i % 2 ? -0.1 : 0.1) * s);
        drawSprinkle(c, s * 0.12, col, i);
        c.restore();
      });
      break;
  }
}

/** A passive's little picture: a jar with its color. */
export function drawPassiveIcon(c: Ctx, color: string, s: number, letter: string): void {
  c.beginPath();
  c.roundRect(-s * 0.5, -s * 0.45, s, s * 0.95, s * 0.18);
  fillStroke(c, 'rgba(255,255,255,0.85)', 0.08, s);
  c.beginPath();
  c.roundRect(-s * 0.42, -s * 0.15, s * 0.84, s * 0.58, s * 0.12);
  c.fillStyle = color;
  c.fill();
  c.beginPath();
  c.roundRect(-s * 0.56, -s * 0.62, s * 1.12, s * 0.22, s * 0.08);
  fillStroke(c, '#c98a4b', 0.07, s);
  c.fillStyle = INK;
  c.font = `700 ${Math.round(s * 0.5)}px Rubik, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(letter, 0, s * 0.15);
}
