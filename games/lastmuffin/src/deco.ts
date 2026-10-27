// Things lying on the bakery floor, just for looks: flour sacks, a dropped
// cookie, spilled sugar, a wooden spoon. The floor goes on forever, so it's
// cut into squares and each square gets the same few props every time (from
// its coordinates), muted so nobody mistakes them for pickups or pests.
type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Side of one square of floor, in world units. */
export const CHUNK = 300;

export type PropKind = 'sack' | 'cookie' | 'sugar' | 'spoon' | 'chips' | 'milk' | 'egg' | 'cherry' | 'butter' | 'tray';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** Turned this much. */
  rot: number;
  /** Size, in world units. */
  s: number;
}

const KINDS: { kind: PropKind; weight: number; s: [number, number] }[] = [
  { kind: 'sack', weight: 2, s: [22, 28] },
  { kind: 'cookie', weight: 3, s: [9, 12] },
  { kind: 'sugar', weight: 3, s: [16, 24] },
  { kind: 'spoon', weight: 2, s: [20, 26] },
  { kind: 'chips', weight: 3, s: [10, 14] },
  { kind: 'milk', weight: 2, s: [18, 26] },
  { kind: 'egg', weight: 1, s: [10, 12] },
  { kind: 'cherry', weight: 2, s: [7, 9] },
  { kind: 'butter', weight: 1, s: [10, 12] },
  { kind: 'tray', weight: 1, s: [34, 40] },
];
const TOTAL = KINDS.reduce((n, k) => n + k.weight, 0);

function hash(x: number, y: number, k: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The props in one square of floor: zero to three of them. */
export function propsIn(cx: number, cy: number): Prop[] {
  const n = Math.floor(hash(cx, cy, 0) * 3.4);
  const out: Prop[] = [];
  for (let i = 0; i < n; i++) {
    let roll = hash(cx, cy, 10 + i) * TOTAL;
    let pick = KINDS[0];
    for (const k of KINDS) {
      roll -= k.weight;
      if (roll <= 0) {
        pick = k;
        break;
      }
    }
    out.push({
      kind: pick.kind,
      x: (cx + 0.1 + hash(cx, cy, 20 + i) * 0.8) * CHUNK,
      y: (cy + 0.1 + hash(cx, cy, 30 + i) * 0.8) * CHUNK,
      rot: (hash(cx, cy, 40 + i) - 0.5) * 1.4,
      s: pick.s[0] + hash(cx, cy, 50 + i) * (pick.s[1] - pick.s[0]),
    });
  }
  return out;
}

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

function line(c: Ctx, s: number, w = 0.06): void {
  c.lineWidth = Math.max(1, s * w);
  c.strokeStyle = 'rgba(42,26,18,0.7)';
  c.stroke();
}

/** One prop around (0, 0) at size `s`. Drawn a little faded: it's scenery. */
export function drawProp(c: Ctx, kind: PropKind, s: number): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // A soft shadow under everything that stands up.
  if (kind === 'sack' || kind === 'tray' || kind === 'egg' || kind === 'butter') {
    ellipse(c, s * 0.08, s * 0.55, s * 0.95, s * 0.3);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fill();
  }
  switch (kind) {
    case 'sack': {
      c.beginPath();
      c.moveTo(-s * 0.7, s * 0.55);
      c.quadraticCurveTo(-s * 0.85, -s * 0.1, -s * 0.5, -s * 0.6);
      c.lineTo(-s * 0.2, -s * 0.85);
      c.lineTo(s * 0.25, -s * 0.85);
      c.lineTo(s * 0.5, -s * 0.6);
      c.quadraticCurveTo(s * 0.85, -s * 0.1, s * 0.7, s * 0.55);
      c.closePath();
      c.fillStyle = '#d9c7a4';
      c.fill();
      line(c, s);
      c.strokeStyle = '#8a6a42';
      c.lineWidth = s * 0.08;
      c.beginPath();
      c.moveTo(-s * 0.32, -s * 0.66);
      c.lineTo(s * 0.32, -s * 0.66);
      c.stroke();
      c.fillStyle = '#b5523a';
      c.font = `700 ${Math.round(s * 0.32)}px Rubik, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('FLOUR', 0, s * 0.08);
      // A little spilled out the side.
      ellipse(c, s * 0.9, s * 0.5, s * 0.45, s * 0.16);
      c.fillStyle = 'rgba(250,246,238,0.6)';
      c.fill();
      break;
    }
    case 'cookie': {
      ellipse(c, 0, 0, s, s * 0.92);
      c.fillStyle = '#c98a4b';
      c.fill();
      line(c, s, 0.1);
      for (const [x, y] of [
        [-0.4, -0.3],
        [0.3, -0.4],
        [0.1, 0.25],
        [-0.35, 0.35],
        [0.5, 0.2],
      ]) {
        ellipse(c, x * s, y * s, s * 0.14, s * 0.12);
        c.fillStyle = '#4a2a16';
        c.fill();
      }
      // A bite out of it.
      c.globalCompositeOperation = 'destination-out';
      ellipse(c, s * 0.95, -s * 0.5, s * 0.38, s * 0.38);
      c.fill();
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'sugar': {
      c.fillStyle = 'rgba(255,253,248,0.55)';
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        ellipse(c, Math.cos(a) * s * 0.5 * (i % 3) * 0.5, Math.sin(a) * s * 0.3 * (i % 3) * 0.5, s * (0.5 - i * 0.04), s * (0.28 - i * 0.02), a);
        c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 14; i++) {
        const a = i * 1.7;
        const d = (i % 5) * 0.2 + 0.2;
        c.fillRect(Math.cos(a) * s * d, Math.sin(a) * s * d * 0.6, Math.max(1, s * 0.05), Math.max(1, s * 0.05));
      }
      break;
    }
    case 'spoon': {
      c.beginPath();
      c.roundRect(-s * 0.9, -s * 0.07, s * 1.1, s * 0.14, s * 0.07);
      c.fillStyle = '#b5793d';
      c.fill();
      line(c, s);
      ellipse(c, s * 0.52, 0, s * 0.36, s * 0.24);
      c.fillStyle = '#c98a4b';
      c.fill();
      line(c, s);
      ellipse(c, s * 0.52, 0, s * 0.22, s * 0.13);
      c.fillStyle = 'rgba(120,70,30,0.35)';
      c.fill();
      break;
    }
    case 'chips': {
      for (let i = 0; i < 6; i++) {
        const a = i * 1.9;
        const d = (i % 3) * 0.35 + 0.15;
        c.beginPath();
        const x = Math.cos(a) * s * d;
        const y = Math.sin(a) * s * d;
        c.moveTo(x - s * 0.16, y + s * 0.1);
        c.quadraticCurveTo(x, y - s * 0.3, x + s * 0.16, y + s * 0.1);
        c.closePath();
        c.fillStyle = '#3a2012';
        c.fill();
      }
      break;
    }
    case 'milk': {
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * TAU;
        const r = s * (0.8 + (i % 3 === 0 ? 0.25 : 0) + Math.sin(a * 2) * 0.08);
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.55);
        else c.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.55);
      }
      c.closePath();
      c.fillStyle = 'rgba(250,250,255,0.5)';
      c.fill();
      ellipse(c, -s * 0.25, -s * 0.12, s * 0.25, s * 0.07, -0.2);
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fill();
      break;
    }
    case 'egg': {
      for (const k of [-1, 1]) {
        c.beginPath();
        c.moveTo(k * s * 0.15, -s * 0.5);
        c.quadraticCurveTo(k * s * 0.95, -s * 0.45, k * s * 0.8, s * 0.35);
        c.lineTo(k * s * 0.5, s * 0.05);
        c.lineTo(k * s * 0.35, s * 0.3);
        c.lineTo(k * s * 0.15, s * 0.0);
        c.closePath();
        c.fillStyle = '#f4ead8';
        c.fill();
        line(c, s, 0.08);
      }
      break;
    }
    case 'cherry': {
      c.strokeStyle = '#4a6a1c';
      c.lineWidth = Math.max(1, s * 0.12);
      c.beginPath();
      c.moveTo(0, -s * 0.2);
      c.quadraticCurveTo(s * 0.3, -s * 1.2, s * 0.9, -s * 1.3);
      c.stroke();
      ellipse(c, 0, s * 0.15, s * 0.65, s * 0.6);
      c.fillStyle = '#b02a3a';
      c.fill();
      line(c, s, 0.1);
      ellipse(c, -s * 0.22, -s * 0.05, s * 0.18, s * 0.12);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fill();
      break;
    }
    case 'butter': {
      c.beginPath();
      c.roundRect(-s, -s * 0.5, s * 2, s, s * 0.2);
      c.fillStyle = '#f6dc7a';
      c.fill();
      line(c, s, 0.08);
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.fillRect(-s * 0.8, -s * 0.35, s * 1.2, s * 0.15);
      break;
    }
    case 'tray': {
      c.beginPath();
      c.roundRect(-s, -s * 0.6, s * 2, s * 1.2, s * 0.08);
      c.fillStyle = '#9aa2ac';
      c.fill();
      line(c, s, 0.04);
      c.beginPath();
      c.roundRect(-s * 0.9, -s * 0.5, s * 1.8, s, s * 0.06);
      c.fillStyle = '#7a828c';
      c.fill();
      // Two forgotten cookies.
      for (const x of [-0.45, 0.4]) {
        ellipse(c, x * s, 0, s * 0.28, s * 0.26);
        c.fillStyle = '#c98a4b';
        c.fill();
        line(c, s, 0.03);
      }
      break;
    }
  }
}

