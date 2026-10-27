// The containment unit: a two-floor glass cell in a lab. Ground floor:
// shower, toilet, armchair, fridge and oven, with an observation window where
// a scientist watches. The loft: bed, a plant and a gaming PC, reached by a
// ladder on the right. It comes with only the toilet and the shower; the rest
// waits as taped-out spots until it's bought. This file lays it out and draws
// the furniture and his trash; the scene decides what happens in it.
import type { FurnitureId, TrashKind } from './defs';

const TAU = Math.PI * 2;
const INK = '#1f1a24';

export interface Box {
  x0: number;
  x1: number;
  /** Top of the furniture. */
  y0: number;
  /** The floor it stands on. */
  y1: number;
}

export interface Room {
  W: number;
  H: number;
  /** Inside of the cell. */
  L: number;
  R: number;
  T: number;
  B: number;
  /** Floor surfaces: the ground floor and the loft. */
  ground: number;
  loft: number;
  /** The loft runs from L to here; past it is the stairwell with the ladder. */
  loftEnd: number;
  shower: Box;
  toilet: Box;
  chair: Box;
  fridge: Box;
  oven: Box;
  ladder: Box;
  window: Box;
  bed: Box;
  plant: Box;
  pc: Box;
  /** The DoorDosh hatch in the ceiling, over the stairwell. */
  hatchX: number;
  /** Hammy's size here. */
  r: number;
}

export const LOFT_SLAB = 8;

export function layoutRoom(W: number, H: number): Room {
  const side = Math.max(8, W * 0.025);
  const L = side;
  const R = W - side;
  const T = Math.max(26, H * 0.055);
  const B = H - Math.max(14, H * 0.035);
  const ground = B - Math.max(6, H * 0.015);
  const loft = T + (ground - T) * 0.47;
  const fx = (f: number) => L + (R - L) * f;
  const low = ground - (loft + LOFT_SLAB);
  const high = loft - T;
  const box = (a: number, b: number, height: number, floor: number): Box => ({ x0: fx(a), x1: fx(b), y0: floor - height, y1: floor });
  return {
    W,
    H,
    L,
    R,
    T,
    B,
    ground,
    loft,
    loftEnd: fx(0.78),
    shower: box(0.01, 0.19, low * 0.93, ground),
    toilet: box(0.215, 0.33, low * 0.3, ground),
    chair: box(0.36, 0.53, low * 0.4, ground),
    fridge: box(0.56, 0.7, low * 0.72, ground),
    oven: box(0.72, 0.87, low * 0.42, ground),
    ladder: box(0.89, 0.97, ground - loft + 18, ground),
    window: { x0: fx(0.35), x1: fx(0.54), y0: loft + LOFT_SLAB + low * 0.08, y1: loft + LOFT_SLAB + low * 0.46 },
    bed: box(0.01, 0.33, high * 0.26, loft),
    plant: box(0.35, 0.43, high * 0.4, loft),
    pc: box(0.46, 0.77, high * 0.66, loft),
    hatchX: fx(0.9),
    r: Math.min(48, Math.max(14, Math.min((R - L) * 0.07, low * 0.18))),
  };
}

type Ctx = CanvasRenderingContext2D;
type RGB = readonly [number, number, number];

const SHADOW: RGB = [22, 28, 44];
const LAMP: RGB = [255, 244, 214];

function rect(c: Ctx, x: number, y: number, w: number, h: number, r: number | number[] = 0): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** A steady pseudo-random number in [0, 1) for a pair of whole numbers. */
function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const rgba = (c: RGB, a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a: RGB, b: RGB, k: number): string => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;

/** A soft round light (or shadow) that fades out to nothing at radius r. */
function glow(c: Ctx, x: number, y: number, r: number, col: RGB, a: number): void {
  if (r <= 0 || a <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** The same, squashed into an ellipse: light pools and contact shadows. */
function flatGlow(c: Ctx, x: number, y: number, rx: number, ry: number, col: RGB, a: number): void {
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  glow(c, 0, 0, rx, col, a);
  c.restore();
}

/** A band of colour that is `a` strong on one side and fades out across it. */
function fade(c: Ctx, x: number, y: number, w: number, h: number, col: RGB, a: number, from: 'top' | 'bottom' | 'left' | 'right'): void {
  const g =
    from === 'top'
      ? c.createLinearGradient(0, y, 0, y + h)
      : from === 'bottom'
        ? c.createLinearGradient(0, y + h, 0, y)
        : from === 'left'
          ? c.createLinearGradient(x, 0, x + w, 0)
          : c.createLinearGradient(x + w, 0, x, 0);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
}

/** A soft shadow where something stands on the floor. */
function footShadow(c: Ctx, x0: number, x1: number, y: number, a = 0.3): void {
  const rx = (x1 - x0) / 2 + 5;
  flatGlow(c, (x0 + x1) / 2, y, rx, Math.max(3, rx * 0.13), SHADOW, a);
}

function bolt(c: Ctx, x: number, y: number, r: number): void {
  c.fillStyle = '#3a414a';
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(220,228,236,0.8)';
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, TAU);
  c.fill();
}

/** Brushed steel or chrome, lit from the top. */
function chrome(c: Ctx, y0: number, y1: number): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#f4f7f9');
  g.addColorStop(0.5, '#b7c0c8');
  g.addColorStop(1, '#7d8893');
  return g;
}

/**
 * How dark it is, from 0 (day) to 1 (night), by the player's clock: the lab
 * dims the unit in the evening and the lamps take over.
 */
export function nightLevel(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 8 && h < 18) return 0;
  if (h >= 18 && h < 21) return (h - 18) / 3;
  if (h >= 5 && h < 8) return 1 - (h - 5) / 3;
  return 1;
}

interface Lamp {
  x: number;
  /** The ceiling it hangs from. */
  y: number;
  /** The floor it lights. */
  floor: number;
  w: number;
}

/** Strip lights: two on the loft ceiling, two under the loft. */
function lampsOf(m: Room): Lamp[] {
  const fx = (f: number) => m.L + (m.R - m.L) * f;
  const w = Math.min(72, (m.R - m.L) * 0.14);
  return [
    { x: fx(0.2), y: m.T, floor: m.loft, w },
    { x: fx(0.6), y: m.T, floor: m.loft, w },
    { x: fx(0.27), y: m.loft + LOFT_SLAB, floor: m.ground, w },
    { x: fx(0.64), y: m.loft + LOFT_SLAB, floor: m.ground, w },
  ];
}

function lampLight(c: Ctx, l: Lamp, a: number): void {
  const h = l.floor - l.y;
  const top = l.w * 0.45;
  const bottom = l.w * 1.1 + h * 0.3;
  // A faint beam, a soft glow around it and a pool on the floor.
  const g = c.createLinearGradient(0, l.y, 0, l.floor);
  g.addColorStop(0, rgba(LAMP, a * 0.55));
  g.addColorStop(1, rgba(LAMP, 0));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(l.x - top, l.y + 6);
  c.lineTo(l.x + top, l.y + 6);
  c.lineTo(l.x + bottom, l.floor);
  c.lineTo(l.x - bottom, l.floor);
  c.closePath();
  c.fill();
  c.save();
  c.translate(l.x, l.y);
  c.scale(1.3, 1);
  glow(c, 0, 0, h * 0.75, LAMP, a);
  c.restore();
  flatGlow(c, l.x, l.floor, bottom * 1.1, Math.max(4, h * 0.05), LAMP, a * 1.4);
}

function lampFixture(c: Ctx, l: Lamp, night: number): void {
  c.fillStyle = '#4f5864';
  rect(c, l.x - l.w / 2, l.y, l.w, 5, [0, 0, 2, 2]);
  c.fill();
  c.fillStyle = mix([238, 236, 226], [255, 250, 228], night);
  rect(c, l.x - l.w / 2 + 3, l.y + 4, l.w - 6, 3, 1.5);
  c.fill();
  glow(c, l.x, l.y + 6, l.w * 0.6, LAMP, 0.35 + night * 0.35);
}

/** Everything that never moves: the cell, its walls and floors, the lights and the furniture's bodies. */
/** Taped-out spots for furniture not bought yet. */
const SLOTS: readonly [FurnitureId, string][] = [
  ['chair', 'ARMCHAIR'],
  ['fridge', 'FRIDGE'],
  ['oven', 'OVEN'],
  ['bed', 'BED'],
  ['plant', 'PLANT'],
  ['pc', 'GAMING PC'],
];

export function paintRoom(c: Ctx, m: Room, night = 0, has: (id: FurnitureId) => boolean = () => true): void {
  const { W, H, L, R, T, B, ground, loft, loftEnd } = m;
  // The lab outside, which only shows at the edges.
  c.fillStyle = '#121822';
  c.fillRect(0, 0, W, H);

  // The back wall: glazed tiles, each a touch different, with a lip of light on its top edge.
  const wall = c.createLinearGradient(0, T, 0, B);
  wall.addColorStop(0, mix([228, 236, 240], [126, 138, 162], night * 0.75));
  wall.addColorStop(1, mix([194, 207, 215], [92, 104, 128], night * 0.75));
  c.fillStyle = wall;
  c.fillRect(L, T, R - L, B - T);
  const tile = Math.max(14, m.r * 0.9);
  for (let j = 0; T + j * tile < B; j++) {
    for (let i = 0; L + i * tile < R; i++) {
      const k = hash(i, j);
      if (k < 0.35) continue;
      c.fillStyle = k > 0.8 ? 'rgba(255,255,255,0.07)' : 'rgba(40,60,80,0.035)';
      c.fillRect(L + i * tile, T + j * tile, tile, tile);
    }
  }
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(60,80,100,0.16)';
  c.beginPath();
  for (let y = T + tile; y < B; y += tile) {
    c.moveTo(L, y);
    c.lineTo(R, y);
  }
  for (let x = L + tile; x < R; x += tile) {
    c.moveTo(x, T);
    c.lineTo(x, B);
  }
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.22)';
  c.beginPath();
  for (let y = T + tile + 1; y < B; y += tile) {
    c.moveTo(L, y);
    c.lineTo(R, y);
  }
  c.stroke();
  // The loft is the bedroom: a little warmer up there.
  c.fillStyle = 'rgba(255,214,170,0.07)';
  c.fillRect(L, T, loftEnd - L, loft - T);

  // Skirting boards.
  for (const [x1, y] of [
    [loftEnd, loft],
    [R, ground],
  ] as const) {
    c.fillStyle = '#9aa5b0';
    c.fillRect(L, y - 5, x1 - L, 5);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(L, y - 5, x1 - L, 1);
  }

  // A pipe along the ceiling and down the far wall.
  const pr = Math.max(2.5, m.r * 0.1);
  c.fillStyle = chrome(c, T + 4 - pr, T + 4 + pr);
  c.fillRect(L, T + 4 - pr, R - L - 6, pr * 2);
  const pg = c.createLinearGradient(R - 6 - pr, 0, R - 6 + pr, 0);
  pg.addColorStop(0, '#f4f7f9');
  pg.addColorStop(0.5, '#b7c0c8');
  pg.addColorStop(1, '#7d8893');
  c.fillStyle = pg;
  c.fillRect(R - 6 - pr, T + 4 - pr, pr * 2, ground - T - 4);
  c.fillStyle = '#6d7782';
  for (let x = L + 40; x < R - 30; x += 90) c.fillRect(x, T, 4, 4 + pr);
  c.fillRect(R - 6 - pr - 1, T + 4 - pr - 1, pr * 2 + 2, pr * 2 + 2);

  // Wall things: a poster over the bed, a sign over the toilet, a shelf over the oven, the camera.
  const high = loft - T;
  const low = ground - (loft + LOFT_SLAB);
  const fx = (f: number) => L + (R - L) * f;
  const pw = (R - L) * 0.16;
  paintPoster(c, fx(0.065), T + high * 0.13, pw, Math.min(high * 0.34, pw * 1.3));
  const sign = Math.min((R - L) * 0.085, low * 0.15);
  paintNoFart(c, fx(0.272), loft + LOFT_SLAB + low * 0.13, sign);
  paintShelf(c, m.oven.x0 + 2, m.oven.x1 - 2, m.oven.y0 - low * 0.27);
  paintCamera(c, m);
  paintChute(c, m);

  // Observation window, with the lab behind it.
  paintWindow(c, m, night);

  // Night falls on the walls before the lamps light them.
  if (night > 0) {
    c.fillStyle = `rgba(16,20,48,${0.3 * night})`;
    c.fillRect(L, T, R - L, B - T);
  }
  const lamps = lampsOf(m);
  for (const l of lamps) lampLight(c, l, 0.1 + night * 0.16);

  // Shade in the corners: under the ceiling, under the loft, along the floors and walls.
  fade(c, L, T, R - L, 20, SHADOW, 0.2, 'top');
  fade(c, L, loft + LOFT_SLAB, loftEnd - L, 36, SHADOW, 0.26, 'top');
  fade(c, L, loft - 24, loftEnd - L, 24, SHADOW, 0.14, 'bottom');
  fade(c, L, ground - 30, R - L, 30, SHADOW, 0.18, 'bottom');
  fade(c, L, T, 18, B - T, SHADOW, 0.18, 'left');
  fade(c, R - 18, T, 18, B - T, SHADOW, 0.18, 'right');

  // Ground floor: polished concrete in slabs.
  const fl = c.createLinearGradient(0, ground, 0, B);
  fl.addColorStop(0, mix([168, 176, 183], [104, 110, 128], night * 0.6));
  fl.addColorStop(1, mix([112, 120, 127], [70, 76, 92], night * 0.6));
  c.fillStyle = fl;
  c.fillRect(L, ground, R - L, B - ground);
  c.strokeStyle = 'rgba(40,50,60,0.2)';
  c.lineWidth = 1;
  const mid = (L + R) / 2;
  c.beginPath();
  for (let x = L + 24; x < R; x += 44) {
    c.moveTo(x, ground);
    c.lineTo(mid + (x - mid) * 1.1, B);
  }
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fillRect(L, ground, R - L, 1.5);
  for (const l of lamps) if (l.floor === ground) flatGlow(c, l.x, ground + (B - ground) * 0.4, l.w * 1.6, (B - ground) * 0.6, [255, 255, 255], 0.18);

  // The loft: a steel deck with rivets and a railing, open over the stairwell.
  const sg = c.createLinearGradient(0, loft, 0, loft + LOFT_SLAB);
  sg.addColorStop(0, '#7f8996');
  sg.addColorStop(1, '#4a525d');
  c.fillStyle = sg;
  c.fillRect(L, loft, loftEnd - L, LOFT_SLAB);
  c.fillStyle = '#a9b2bd';
  c.fillRect(L, loft, loftEnd - L, 1.5);
  c.fillStyle = '#343a43';
  c.fillRect(L, loft + LOFT_SLAB - 1, loftEnd - L, 1);
  c.fillRect(loftEnd - 2, loft, 2, LOFT_SLAB);
  for (let x = L + 9; x < loftEnd - 5; x += 22) bolt(c, x, loft + LOFT_SLAB / 2 + 0.5, 1.3);
  const rail = loft - m.r * 1.3;
  const rails: [number, number, number, number][] = [
    [loftEnd - 1, loft, loftEnd - 1, rail],
    [loftEnd - 1, rail, loftEnd - m.r * 1.6, rail],
  ];
  for (let i = 1; i < 3; i++) rails.push([loftEnd - 1 - i * m.r * 0.55, loft, loftEnd - 1 - i * m.r * 0.55, rail]);
  c.lineCap = 'round';
  for (const [w, col, off] of [
    [3.5, '#3d444d', 0],
    [1.2, '#b9c2cc', -0.8],
  ] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    for (const [x0, y0, x1, y1] of rails) {
      c.moveTo(x0 + off, y0 + off);
      c.lineTo(x1 + off, y1 + off);
    }
    c.stroke();
  }
  c.lineCap = 'butt';

  // The ladder up to the loft, with its shadow on the wall.
  const lad = m.ladder;
  const ladder = (dx: number, dy: number, rails: string, rungs: string, width: number) => {
    c.strokeStyle = rungs;
    c.lineWidth = width * 0.7;
    c.beginPath();
    for (let y = lad.y1 - 12; y > lad.y0 + 4; y -= 14) {
      c.moveTo(lad.x0 + 1 + dx, y + dy);
      c.lineTo(lad.x1 - 1 + dx, y + dy);
    }
    c.stroke();
    c.strokeStyle = rails;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(lad.x0 + dx, lad.y1 + dy);
    c.lineTo(lad.x0 + 3 + dx, lad.y0 + dy);
    c.moveTo(lad.x1 + dx, lad.y1 + dy);
    c.lineTo(lad.x1 - 3 + dx, lad.y0 + dy);
    c.stroke();
  };
  ladder(4, 0, 'rgba(22,28,44,0.16)', 'rgba(22,28,44,0.12)', 4);
  ladder(0, 0, '#c4922f', '#a87b24', 3.5);
  ladder(-0.8, -0.8, '#f0cd7a', '#e3b85c', 1);
  c.fillStyle = '#2b2f36';
  c.fillRect(lad.x0 - 2, lad.y1 - 3, 5, 3);
  c.fillRect(lad.x1 - 3, lad.y1 - 3, 5, 3);

  // The furniture he has, each with its shadow on the floor, and tape where the rest would go.
  const ground3: FurnitureId[] = ['chair', 'fridge', 'oven'];
  for (const b of [m.shower, m.toilet, ...ground3.filter(has).map((id) => m[id])]) footShadow(c, b.x0, b.x1, ground);
  for (const id of ['bed', 'plant'] as const) if (has(id)) footShadow(c, m[id].x0, m[id].x1, loft);
  if (has('pc')) footShadow(c, m.pc.x0, m.pc.x1, loft, 0.22);
  for (const [id, label] of SLOTS) if (!has(id)) paintSlot(c, m[id], label);
  paintShower(c, m.shower);
  paintToilet(c, m.toilet);
  if (has('chair')) paintChair(c, m.chair);
  if (has('bed')) paintBed(c, m.bed);
  if (has('pc')) paintDesk(c, m.pc);
  if (has('fridge')) paintPizzaBoxes(c, m.fridge);
  for (const l of lamps) lampFixture(c, l, night);
}

/** Floor tape and a stencil where furniture will go once it's bought. */
function paintSlot(c: Ctx, b: Box, label: string): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.save();
  c.fillStyle = 'rgba(255,255,255,0.1)';
  rect(c, b.x0 + 1, b.y0, w - 2, h, 5);
  c.fill();
  c.strokeStyle = 'rgba(52,70,92,0.32)';
  c.lineWidth = 1.5;
  c.setLineDash([5, 4]);
  c.stroke();
  c.setLineDash([]);
  // Yellow tape corners on the floor.
  c.fillStyle = 'rgba(240,196,60,0.8)';
  const t = Math.max(6, Math.min(12, w * 0.14));
  c.fillRect(b.x0 + 1, b.y1 - 3, t, 3);
  c.fillRect(b.x1 - 1 - t, b.y1 - 3, t, 3);
  const size = Math.max(8, Math.min(11, w * 0.11, h * 0.2));
  c.font = `700 ${size}px Rubik, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(52,70,92,0.5)';
  const cx = (b.x0 + b.x1) / 2;
  const cy = b.y0 + h * 0.5;
  c.fillText('+', cx, cy - size * 0.75);
  c.fillText(label, cx, cy + size * 0.45, w - 6);
  c.restore();
}

/** The trash chute on the stairwell wall: where everything he drops ends up, eventually. */
export function chuteOf(m: Room): { x: number; y: number; w: number; h: number } {
  const fx = (f: number) => m.L + (m.R - m.L) * f;
  const w = Math.min(fx(0.875) - fx(0.795), m.r * 1.8);
  const h = Math.min((m.loft - m.T) * 0.34, w * 1.25);
  return { x: (fx(0.795) + fx(0.875)) / 2, y: m.T + (m.loft - m.T) * 0.42, w, h };
}

function paintChute(c: Ctx, m: Room): void {
  const { x, y, w, h } = chuteOf(m);
  const top = y - h / 2;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // A steel plate with a hazard stripe, the flap, and its label.
  c.fillStyle = chrome(c, top, top + h);
  rect(c, x - w / 2, top, w, h, 3);
  c.fill();
  c.stroke();
  c.save();
  rect(c, x - w / 2 + 2, top + 2, w - 4, h * 0.16, 1.5);
  c.clip();
  for (let i = -2; i < 14; i++) {
    c.fillStyle = i % 2 ? '#1f1a24' : '#f0c43c';
    c.beginPath();
    const sx = x - w / 2 + i * 5;
    c.moveTo(sx, top + h * 0.2);
    c.lineTo(sx + 5, top + h * 0.2);
    c.lineTo(sx + 5 + h * 0.2, top);
    c.lineTo(sx + h * 0.2, top);
    c.closePath();
    c.fill();
  }
  c.restore();
  const flap = flapOf(x, y, w, h);
  c.fillStyle = '#3a414a';
  rect(c, flap.x, flap.y, flap.w, flap.h, 2);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fillRect(flap.x + 2, flap.y + 2, flap.w - 4, 1.5);
  c.fillStyle = '#c8d0d8';
  c.fillRect(x - w * 0.12, flap.y + flap.h - 4, w * 0.24, 2);
  const size = Math.max(7, Math.min(10, w * 0.2, h * 0.15));
  c.font = `700 ${size}px Rubik, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#1f1a24';
  c.fillText('TRASH', x, top + h * 0.85, w - 4);
}

function flapOf(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const top = y - h / 2;
  return { x: x - w * 0.36, y: top + h * 0.26, w: w * 0.72, h: h * 0.44 };
}

/** The flap swinging open as something goes down. */
export function drawChuteFlap(c: Ctx, m: Room, open: number): void {
  if (open <= 0) return;
  const { x, y, w, h } = chuteOf(m);
  const f = flapOf(x, y, w, h);
  c.fillStyle = `rgba(8,10,14,${0.9 * open})`;
  rect(c, f.x, f.y, f.w, f.h * open, 2);
  c.fill();
}

/** What's in the bowl he never flushes: 0 is clean water, `max` is clogged. */
export function drawBowl(c: Ctx, b: Box, loads: number, max: number, t: number): void {
  if (loads <= 0) return;
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const { x: cx, y: sy } = toiletSeat(b);
  const k = Math.min(1, loads / max);
  c.save();
  c.beginPath();
  c.ellipse(cx, sy + h * 0.005, w * 0.33, h * 0.065, 0, 0, TAU);
  c.clip();
  c.fillStyle = `rgba(120,86,30,${0.35 + k * 0.45})`;
  c.fillRect(cx - w * 0.4, sy - h * 0.1, w * 0.8, h * 0.2);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = 1;
  for (let i = 0; i < Math.min(loads, max); i++) {
    const bx = cx + (i - (Math.min(loads, max) - 1) / 2) * w * 0.15;
    const by = sy - h * 0.01 - (k >= 1 ? h * 0.05 : 0) + Math.sin(t * 0.003 + i) * 0.6;
    c.fillStyle = i % 2 ? '#6b4423' : '#7a4f28';
    c.beginPath();
    c.ellipse(bx, by, w * 0.09, h * 0.05, 0, Math.PI, TAU);
    c.fill();
    c.stroke();
  }
  if (k >= 1) {
    // Up to the rim, and over it.
    c.fillStyle = '#6b4423';
    c.beginPath();
    c.ellipse(cx + w * 0.38, sy + h * 0.12, w * 0.06, h * 0.12, 0.2, 0, TAU);
    c.fill();
  }
}

/** One piece of his trash, lying on the floor at y. `s` is about a third of his size. */
export function drawTrash(c: Ctx, kind: TrashKind, x: number, y: number, s: number, spin = 0): void {
  c.save();
  c.translate(x, y);
  if (spin) c.rotate(spin);
  c.strokeStyle = 'rgba(31,26,36,0.75)';
  c.lineWidth = 1;
  switch (kind) {
    case 'chips': {
      // A Dorkitos bag, crumpled flat, crimped at both ends.
      c.fillStyle = '#ff8a1f';
      c.beginPath();
      c.moveTo(-s * 0.75, -s * 0.05);
      c.lineTo(-s * 0.6, -s * 0.55);
      c.lineTo(s * 0.55, -s * 0.6);
      c.lineTo(s * 0.8, -s * 0.1);
      c.lineTo(s * 0.7, 0);
      c.lineTo(-s * 0.7, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#ffd34d';
      c.beginPath();
      c.moveTo(-s * 0.15, -s * 0.12);
      c.lineTo(s * 0.2, -s * 0.12);
      c.lineTo(s * 0.02, -s * 0.45);
      c.closePath();
      c.fill();
      c.fillStyle = '#d6332b';
      c.fillRect(-s * 0.6, -s * 0.36, s * 1.15, s * 0.07);
      break;
    }
    case 'pizza': {
      // The box, open, a crust and a grease stain.
      c.fillStyle = '#d9b98a';
      c.beginPath();
      c.moveTo(-s * 1.05, 0);
      c.lineTo(-s * 0.85, -s * 0.28);
      c.lineTo(s * 0.85, -s * 0.28);
      c.lineTo(s * 1.05, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(150,100,40,0.45)';
      c.beginPath();
      c.ellipse(s * 0.2, -s * 0.15, s * 0.3, s * 0.08, 0, 0, TAU);
      c.fill();
      c.strokeStyle = '#c98a3a';
      c.lineWidth = Math.max(1.5, s * 0.12);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-s * 0.55, -s * 0.12);
      c.quadraticCurveTo(-s * 0.3, -s * 0.3, -s * 0.05, -s * 0.14);
      c.stroke();
      c.lineCap = 'butt';
      break;
    }
    case 'foil': {
      const g = c.createRadialGradient(-s * 0.15, -s * 0.5, s * 0.05, 0, -s * 0.4, s * 0.5);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#9aa3ad');
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const rr = s * (0.36 + ((i * 7) % 3) * 0.05);
        const px = Math.cos(a) * rr;
        const py = -s * 0.38 + Math.sin(a) * rr;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = 'rgba(80,90,100,0.6)';
      c.beginPath();
      c.moveTo(-s * 0.2, -s * 0.5);
      c.lineTo(s * 0.05, -s * 0.3);
      c.lineTo(s * 0.2, -s * 0.55);
      c.stroke();
      break;
    }
    case 'bones': {
      // Picked clean. Mostly.
      for (const [a, dx] of [
        [0.3, -0.15],
        [-0.4, 0.2],
      ] as const) {
        c.save();
        c.translate(dx * s, -s * 0.16);
        c.rotate(a);
        c.fillStyle = '#f4ecd8';
        c.fillRect(-s * 0.45, -s * 0.07, s * 0.9, s * 0.14);
        c.strokeRect(-s * 0.45, -s * 0.07, s * 0.9, s * 0.14);
        for (const ex of [-0.48, 0.48]) {
          for (const ey of [-0.08, 0.08]) {
            c.beginPath();
            c.arc(ex * s, ey * s, s * 0.1, 0, TAU);
            c.fill();
            c.stroke();
          }
        }
        c.restore();
      }
      c.fillStyle = 'rgba(194,65,12,0.55)';
      c.beginPath();
      c.ellipse(0, -s * 0.05, s * 0.18, s * 0.05, 0, 0, TAU);
      c.fill();
      break;
    }
    case 'can': {
      // An empty can of the green stuff, on its side and a bit crushed.
      const w = s * 1.1;
      const h = s * 0.5;
      c.fillStyle = '#4fc65e';
      c.beginPath();
      c.moveTo(-w / 2, -h);
      c.lineTo(-w * 0.05, -h);
      c.lineTo(w * 0.05, -h * 0.82);
      c.lineTo(w / 2, -h);
      c.lineTo(w / 2, 0);
      c.lineTo(w * 0.05, -h * 0.12);
      c.lineTo(-w * 0.05, 0);
      c.lineTo(-w / 2, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#1b1b22';
      c.fillRect(-w * 0.32, -h * 0.66, w * 0.22, h * 0.36);
      c.fillStyle = '#c8d0d8';
      c.fillRect(w / 2 - 2, -h, 2, h);
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.fillRect(-w * 0.45, -h * 0.85, w * 0.35, 1);
      break;
    }
    case 'tray': {
      // A foam clamshell, lid open, something pink left in it.
      c.fillStyle = '#f7f7f2';
      c.beginPath();
      c.moveTo(-s * 0.8, 0);
      c.lineTo(-s * 0.7, -s * 0.24);
      c.lineTo(s * 0.7, -s * 0.24);
      c.lineTo(s * 0.8, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(s * 0.7, -s * 0.24);
      c.lineTo(s * 0.95, -s * 0.7);
      c.lineTo(-s * 0.35, -s * 0.72);
      c.lineTo(-s * 0.7, -s * 0.24);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#f472b6';
      c.beginPath();
      c.ellipse(-s * 0.15, -s * 0.24, s * 0.2, s * 0.08, 0, Math.PI, TAU);
      c.fill();
      break;
    }
    case 'sock': {
      c.fillStyle = '#f2efe6';
      c.beginPath();
      c.moveTo(-s * 0.55, -s * 1.05);
      c.lineTo(-s * 0.05, -s * 1.05);
      c.lineTo(0, -s * 0.38);
      c.quadraticCurveTo(s * 0.75, -s * 0.42, s * 0.75, 0);
      c.lineTo(-s * 0.55, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#b9b2a2';
      c.fillRect(-s * 0.55, -s * 1.05, s * 0.5, s * 0.22);
      c.fillStyle = 'rgba(120,100,60,0.35)';
      c.beginPath();
      c.ellipse(s * 0.4, -s * 0.12, s * 0.2, s * 0.08, 0, 0, TAU);
      c.fill();
      break;
    }
    case 'tissue': {
      // Used. Don't ask what for.
      c.fillStyle = '#fbfbf7';
      c.beginPath();
      c.moveTo(-s * 0.5, 0);
      c.quadraticCurveTo(-s * 0.65, -s * 0.45, -s * 0.2, -s * 0.55);
      c.quadraticCurveTo(0, -s * 0.8, s * 0.25, -s * 0.55);
      c.quadraticCurveTo(s * 0.65, -s * 0.45, s * 0.5, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(155,194,58,0.55)';
      c.beginPath();
      c.ellipse(s * 0.05, -s * 0.3, s * 0.16, s * 0.1, 0.4, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(31,26,36,0.3)';
      c.beginPath();
      c.moveTo(-s * 0.25, -s * 0.1);
      c.lineTo(-s * 0.05, -s * 0.4);
      c.stroke();
      break;
    }
  }
  c.restore();
}

function paintWindow(c: Ctx, m: Room, night: number): void {
  const w = m.window;
  const ww = w.x1 - w.x0;
  const wh = w.y1 - w.y0;
  c.save();
  rect(c, w.x0, w.y0, ww, wh, 4);
  c.clip();
  const lab = c.createLinearGradient(0, w.y0, 0, w.y1);
  lab.addColorStop(0, mix([44, 62, 88], [24, 32, 50], night));
  lab.addColorStop(1, mix([24, 32, 46], [14, 18, 28], night));
  c.fillStyle = lab;
  c.fillRect(w.x0, w.y0, ww, wh);
  // A strip light and shelves of glowing bottles in the lab.
  c.fillStyle = 'rgba(220,240,255,0.55)';
  c.fillRect(w.x0 + ww * 0.15, w.y0 + 3, ww * 0.7, 2);
  glow(c, w.x0 + ww / 2, w.y0 + 3, ww * 0.6, [200, 230, 255], 0.2);
  const bottles: RGB[] = [
    [110, 230, 160],
    [255, 120, 170],
    [120, 190, 255],
    [255, 210, 90],
  ];
  for (const [sx0, sx1] of [
    [w.x0, w.x0 + ww * 0.32],
    [w.x1 - ww * 0.32, w.x1],
  ] as const) {
    for (const sy of [w.y0 + wh * 0.4, w.y0 + wh * 0.72]) {
      for (let i = 0; i < 3; i++) {
        const bx = sx0 + (sx1 - sx0) * (0.22 + i * 0.28);
        const bh = wh * 0.1 * (0.7 + hash(i, Math.round(sy)) * 0.7);
        const col = bottles[(i + Math.round(sy) + Math.round(sx0)) % bottles.length];
        glow(c, bx, sy - bh / 2, bh * 1.2, col, 0.25);
        c.fillStyle = rgba(col, 0.85);
        rect(c, bx - 2.5, sy - bh, 5, bh, 1.5);
        c.fill();
        c.fillRect(bx - 1, sy - bh - 3, 2, 3);
      }
      c.fillStyle = '#5a6a80';
      c.fillRect(sx0, sy, sx1 - sx0, 2);
    }
  }
  c.restore();
  // A deep steel frame and a sill.
  c.strokeStyle = '#3f4752';
  c.lineWidth = 5;
  rect(c, w.x0, w.y0, ww, wh, 4);
  c.stroke();
  c.strokeStyle = 'rgba(200,210,222,0.55)';
  c.lineWidth = 1;
  rect(c, w.x0 - 2.5, w.y0 - 2.5, ww + 5, wh + 5, 6);
  c.stroke();
  c.fillStyle = chrome(c, w.y1 + 2, w.y1 + 7);
  rect(c, w.x0 - 6, w.y1 + 2, ww + 12, 5, 1.5);
  c.fill();
  fade(c, w.x0 - 6, w.y1 + 7, ww + 12, 10, SHADOW, 0.22, 'top');
  // The sign over it says what it is.
  const room = w.y0 - (m.loft + LOFT_SLAB) - 6;
  if (room >= 9) {
    const sh = Math.min(16, room - 2);
    const size = Math.max(6, Math.round(sh * 0.62));
    c.font = `800 ${size}px Rubik, system-ui, sans-serif`;
    const label = 'OBSERVATION';
    const sw = Math.min(ww, c.measureText(label).width + 12);
    const sx = w.x0 + (ww - sw) / 2;
    const sy = w.y0 - 4 - sh;
    c.fillStyle = '#2b323c';
    rect(c, sx, sy, sw, sh, 3);
    c.fill();
    c.fillStyle = '#e0332a';
    c.beginPath();
    c.arc(sx + 5, sy + sh / 2, Math.max(1.5, sh * 0.14), 0, TAU);
    c.fill();
    c.fillStyle = '#e8eef4';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, sx + sw / 2 + 3, sy + sh / 2 + 0.5, sw - 12);
  }
}

function paintPoster(c: Ctx, x: number, y: number, w: number, h: number): void {
  c.save();
  fade(c, x - 2, y + h + 2, w + 6, 6, SHADOW, 0.18, 'top');
  c.fillStyle = '#2d2a33';
  rect(c, x - 2, y - 2, w + 4, h + 4, 2);
  c.fill();
  const sky = c.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#7cc7f2');
  sky.addColorStop(0.7, '#ffe3a8');
  sky.addColorStop(1, '#ffd08a');
  c.fillStyle = sky;
  c.fillRect(x, y, w, h);
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  // A branch with a hamster hanging off it.
  const by = (u: number) => y + h * (0.2 - 0.06 * Math.sin(u * Math.PI));
  c.strokeStyle = '#6b4226';
  c.lineWidth = Math.max(2, w * 0.05);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x - 2, by(0));
  c.quadraticCurveTo(x + w * 0.5, y + h * 0.08, x + w + 2, by(1) + h * 0.04);
  c.stroke();
  c.fillStyle = '#5fae4e';
  for (const u of [0.15, 0.8]) {
    c.beginPath();
    c.ellipse(x + w * u, by(u) + 3, w * 0.07, w * 0.035, 0.6, 0, TAU);
    c.fill();
  }
  const hx = x + w * 0.52;
  const hr = w * 0.17;
  const hy = y + h * 0.2 + hr * 1.55;
  c.strokeStyle = '#d18b45';
  c.lineWidth = Math.max(1.8, w * 0.05);
  c.beginPath();
  c.moveTo(hx - hr * 0.7, hy - hr * 0.3);
  c.lineTo(hx - hr * 1.1, y + h * 0.16);
  c.moveTo(hx + hr * 0.7, hy - hr * 0.3);
  c.lineTo(hx + hr * 1.1, y + h * 0.17);
  c.stroke();
  c.fillStyle = '#e6a458';
  for (const dx of [-0.6, 0.6]) {
    c.beginPath();
    c.arc(hx + dx * hr, hy - hr * 0.95, hr * 0.32, 0, TAU);
    c.fill();
  }
  c.beginPath();
  c.ellipse(hx, hy, hr, hr * 1.1, 0, 0, TAU);
  c.fill();
  for (const dx of [-0.45, 0.45]) {
    c.beginPath();
    c.ellipse(hx + dx * hr, hy + hr * 1.05, hr * 0.28, hr * 0.16, 0, 0, TAU);
    c.fill();
  }
  c.fillStyle = '#f2a0a6';
  for (const dx of [-0.6, 0.6]) {
    c.beginPath();
    c.arc(hx + dx * hr, hy - hr * 0.95, hr * 0.16, 0, TAU);
    c.fill();
  }
  c.fillStyle = '#f6dcb4';
  c.beginPath();
  c.ellipse(hx, hy + hr * 0.3, hr * 0.62, hr * 0.7, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#2a1a12';
  for (const dx of [-0.35, 0.35]) {
    c.beginPath();
    c.arc(hx + dx * hr, hy - hr * 0.35, Math.max(0.9, hr * 0.12), 0, TAU);
    c.fill();
  }
  c.fillStyle = '#3b2a1e';
  c.font = `800 ${Math.max(6, Math.round(w * 0.15))}px Rubik, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('HANG IN', x + w / 2, y + h * 0.75, w - 4);
  c.fillText('THERE', x + w / 2, y + h * 0.89, w - 4);
  c.restore();
  c.fillStyle = '#e8443a';
  for (const px of [x + 3, x + w - 3]) {
    c.beginPath();
    c.arc(px, y + 2, 1.8, 0, TAU);
    c.fill();
  }
}

/** The sign over the toilet. Nobody reads it. */
function paintNoFart(c: Ctx, cx: number, y: number, s: number): void {
  const w = s;
  const h = s * 1.28;
  fade(c, cx - w / 2, y + h, w + 3, 5, SHADOW, 0.16, 'top');
  c.fillStyle = '#f7f7f2';
  rect(c, cx - w / 2, y, w, h, 3);
  c.fill();
  c.strokeStyle = '#2a2d33';
  c.lineWidth = 1;
  c.stroke();
  const gy = y + w * 0.48;
  const r = w * 0.3;
  c.fillStyle = '#8fc456';
  for (const [dx, dy, rr] of [
    [-0.45, 0.12, 0.48],
    [0.08, -0.18, 0.58],
    [0.5, 0.16, 0.42],
  ] as const) {
    c.beginPath();
    c.arc(cx + dx * r, gy + dy * r, rr * r, 0, TAU);
    c.fill();
  }
  c.strokeStyle = '#e0332a';
  c.lineWidth = Math.max(1.8, w * 0.085);
  c.beginPath();
  c.arc(cx, gy, r * 1.12, 0, TAU);
  c.moveTo(cx - r * 0.8, gy - r * 0.8);
  c.lineTo(cx + r * 0.8, gy + r * 0.8);
  c.stroke();
  c.fillStyle = '#2a2d33';
  c.font = `800 ${Math.max(5, Math.round(w * 0.15))}px Rubik, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('NO FARTING', cx, y + h * 0.88, w - 3);
}

/** A spice shelf over the oven. */
function paintShelf(c: Ctx, x0: number, x1: number, y: number): void {
  const w = x1 - x0;
  c.fillStyle = '#6b7380';
  for (const bx of [x0 + 5, x1 - 9]) {
    c.beginPath();
    c.moveTo(bx, y + 4);
    c.lineTo(bx + 4, y + 4);
    c.lineTo(bx + 4, y + 11);
    c.closePath();
    c.fill();
  }
  const jw = Math.max(5, w * 0.15);
  const jars: [number, string][] = [
    [0.12, '#e8566a'],
    [0.34, '#f2c14e'],
    [0.56, '#7cc36a'],
  ];
  for (const [u, col] of jars) {
    const jx = x0 + w * u;
    const jh = jw * 1.3;
    c.fillStyle = 'rgba(225,240,250,0.75)';
    rect(c, jx, y - jh, jw, jh, 2);
    c.fill();
    c.fillStyle = col;
    rect(c, jx + 1, y - jh * 0.7, jw - 2, jh * 0.7 - 1, 1.5);
    c.fill();
    c.fillStyle = '#3a3f46';
    c.fillRect(jx - 0.5, y - jh - 2.5, jw + 1, 3);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(jx + 1.5, y - jh + 2, 1.2, jh * 0.6);
  }
  // A mug.
  const mx = x0 + w * 0.78;
  const mw = jw * 1.1;
  c.fillStyle = '#4f86c6';
  rect(c, mx, y - mw, mw, mw, [1, 1, 3, 3]);
  c.fill();
  c.strokeStyle = '#4f86c6';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(mx + mw, y - mw / 2, mw * 0.28, -Math.PI / 2, Math.PI / 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(mx + 1.5, y - mw + 1.5, 1.2, mw * 0.6);
  const sh = c.createLinearGradient(0, y, 0, y + 4);
  sh.addColorStop(0, '#b98250');
  sh.addColorStop(1, '#85562e');
  c.fillStyle = sh;
  c.fillRect(x0, y, w, 4);
  fade(c, x0, y + 4, w, 8, SHADOW, 0.18, 'top');
}

function cameraOf(m: Room): { x: number; y: number; s: number } {
  return { x: m.R - 8, y: m.T + 12, s: Math.max(8, m.r * 0.42) };
}

function paintCamera(c: Ctx, m: Room): void {
  const { x, y, s } = cameraOf(m);
  c.fillStyle = '#4a525c';
  c.fillRect(x - 1.5, m.T, 3, y - m.T);
  c.save();
  c.translate(x, y);
  c.rotate(-0.5);
  c.fillStyle = '#d7dde3';
  c.strokeStyle = INK;
  c.lineWidth = 1;
  rect(c, -s * 1.7, -s * 0.38, s * 1.7, s * 0.76, 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#aeb7c0';
  c.fillRect(-s * 1.7, s * 0.1, s * 1.7, s * 0.28);
  c.fillStyle = '#1b1f26';
  c.beginPath();
  c.arc(-s * 1.7, 0, s * 0.32, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(140,200,255,0.8)';
  c.beginPath();
  c.arc(-s * 1.75, -s * 0.08, s * 0.1, 0, TAU);
  c.fill();
  c.restore();
}

function paintPizzaBoxes(c: Ctx, f: Box): void {
  const fw = f.x1 - f.x0;
  const bh = Math.max(4, fw * 0.08);
  for (let i = 0; i < 3; i++) {
    const x = f.x0 + fw * 0.06 + (i % 2 ? 2 : -1);
    const y = f.y0 - bh * (i + 1);
    c.fillStyle = i % 2 ? '#d9b98a' : '#e4c79b';
    c.fillRect(x, y, fw * 0.86, bh);
    c.strokeStyle = 'rgba(110,80,40,0.7)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, fw * 0.86 - 1, bh - 1);
  }
  c.fillStyle = '#d6332b';
  c.beginPath();
  c.arc(f.x0 + fw * 0.5, f.y0 - bh * 2.5, Math.max(1.5, bh * 0.3), 0, TAU);
  c.fill();
}

function paintShower(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  // Mosaic tiles in the stall, a few in blue.
  const g = c.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
  g.addColorStop(0, '#edf7fb');
  g.addColorStop(1, '#cfe2eb');
  c.fillStyle = g;
  c.fillRect(b.x0, b.y0, w, h);
  const s = Math.max(7, w / 7);
  for (let j = 0; j * s < h; j++) {
    for (let i = 0; i * s < w; i++) {
      const k = hash(i + 31, j + 7);
      if (k < 0.8) continue;
      c.fillStyle = k > 0.93 ? 'rgba(70,150,200,0.3)' : 'rgba(110,180,215,0.2)';
      c.fillRect(b.x0 + i * s, b.y0 + j * s, Math.min(s, w - i * s), Math.min(s, h - j * s));
    }
  }
  c.strokeStyle = 'rgba(80,120,150,0.22)';
  c.lineWidth = 1;
  c.beginPath();
  for (let y = b.y0 + s; y < b.y1; y += s) {
    c.moveTo(b.x0, y);
    c.lineTo(b.x1, y);
  }
  for (let x = b.x0 + s; x < b.x1; x += s) {
    c.moveTo(x, b.y0);
    c.lineTo(x, b.y1);
  }
  c.stroke();
  // A soap niche with a bottle in it, and the tap.
  const nx = b.x0 + w * 0.62;
  const ny = b.y0 + h * 0.36;
  c.fillStyle = 'rgba(60,90,110,0.25)';
  rect(c, nx, ny, w * 0.3, h * 0.08, 2);
  c.fill();
  c.fillStyle = '#ff8fb8';
  rect(c, nx + w * 0.06, ny + h * 0.08 - h * 0.055, w * 0.08, h * 0.055, 1.5);
  c.fill();
  c.fillStyle = '#5ac8b8';
  rect(c, nx + w * 0.17, ny + h * 0.08 - h * 0.04, w * 0.08, h * 0.04, 1.5);
  c.fill();
  c.fillStyle = chrome(c, b.y0 + h * 0.5 - 4, b.y0 + h * 0.5 + 4);
  c.beginPath();
  c.arc(b.x0 + w * 0.5, b.y0 + h * 0.5, Math.max(3, w * 0.07), 0, TAU);
  c.fill();
  c.fillRect(b.x0 + w * 0.5, b.y0 + h * 0.5 - 1.2, w * 0.14, 2.4);
  // Tray, with a drain and a rubber duck.
  const tg = c.createLinearGradient(0, b.y1 - 7, 0, b.y1);
  tg.addColorStop(0, '#f6f9fb');
  tg.addColorStop(1, '#b3c1ca');
  c.fillStyle = tg;
  rect(c, b.x0 - 1, b.y1 - 7, w + 2, 7, 2);
  c.fill();
  c.strokeStyle = 'rgba(31,26,36,0.45)';
  c.stroke();
  c.fillStyle = '#7b8791';
  c.beginPath();
  c.ellipse(b.x0 + w * 0.5, b.y1 - 6.2, w * 0.08, 1.2, 0, 0, TAU);
  c.fill();
  const dx = b.x0 + w * 0.84;
  const dr = Math.max(3, w * 0.06);
  c.fillStyle = '#ffd23f';
  c.beginPath();
  c.ellipse(dx, b.y1 - 7 - dr * 0.6, dr, dr * 0.65, 0, 0, TAU);
  c.arc(dx - dr * 0.55, b.y1 - 7 - dr * 1.35, dr * 0.5, 0, TAU);
  c.fill();
  c.fillStyle = '#ff8a2a';
  c.fillRect(dx - dr * 1.25, b.y1 - 7 - dr * 1.35, dr * 0.35, dr * 0.25);
  // Curtain rail, and a curtain bunched up at one side.
  c.fillStyle = chrome(c, b.y0, b.y0 + 3);
  c.fillRect(b.x0, b.y0 + 0.5, w, 3);
  const cw = w * 0.2;
  const cg = c.createLinearGradient(b.x0, 0, b.x0 + cw, 0);
  cg.addColorStop(0, '#f2bd3c');
  cg.addColorStop(0.5, '#ffe08a');
  cg.addColorStop(1, '#e2aa30');
  c.fillStyle = cg;
  const ch = h - 16;
  c.beginPath();
  c.moveTo(b.x0, b.y0 + 3);
  c.lineTo(b.x0 + cw * 0.8, b.y0 + 3);
  for (let i = 1; i <= 6; i++) {
    const y = b.y0 + 3 + (ch * i) / 6;
    c.quadraticCurveTo(b.x0 + cw * (i % 2 ? 1.15 : 0.7), y - ch / 12, b.x0 + cw * (0.85 + (i % 2) * 0.12), y);
  }
  c.lineTo(b.x0, b.y0 + 3 + ch);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(31,26,36,0.4)';
  c.lineWidth = 1;
  c.stroke();
  c.strokeStyle = 'rgba(170,110,10,0.35)';
  c.beginPath();
  for (const u of [0.32, 0.62]) {
    c.moveTo(b.x0 + cw * u, b.y0 + 4);
    c.lineTo(b.x0 + cw * u, b.y0 + ch);
  }
  c.stroke();
  // Shower head: a chrome arm and a wide rain head.
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = '#7d8a95';
  c.lineWidth = 3.5;
  c.beginPath();
  c.moveTo(b.x0 + w * 0.25, b.y0 + 6);
  c.lineTo(b.x0 + w * 0.5, b.y0 + 6);
  c.lineTo(b.x0 + w * 0.5, b.y0 + 15);
  c.stroke();
  c.strokeStyle = '#eef2f5';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(b.x0 + w * 0.25, b.y0 + 5);
  c.lineTo(b.x0 + w * 0.5 - 1, b.y0 + 5);
  c.stroke();
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
  c.fillStyle = chrome(c, b.y0 + 13, b.y0 + 20);
  c.beginPath();
  c.ellipse(b.x0 + w * 0.5, b.y0 + 19, w * 0.17, 5, 0, Math.PI, TAU);
  c.closePath();
  c.fill();
  c.fillStyle = '#5e6a75';
  c.fillRect(b.x0 + w * 0.33, b.y0 + 18.5, w * 0.34, 1.5);
  // The stall's chrome frame on the open side.
  const fg = c.createLinearGradient(b.x1 - 3, 0, b.x1 + 1, 0);
  fg.addColorStop(0, '#eef2f5');
  fg.addColorStop(1, '#7d8893');
  c.fillStyle = fg;
  c.fillRect(b.x1 - 2.5, b.y0, 3.5, h - 6);
  c.fillStyle = 'rgba(200,230,255,0.5)';
  c.fillRect(b.x1 - 1, b.y0 + h * 0.1, 1, h * 0.5);
}

/** Where the bowl's middle is: he sits here, and the flush swirls here. */
export const toiletSeat = (b: Box): { x: number; y: number } => ({ x: b.x0 + (b.x1 - b.x0) * 0.54, y: b.y0 + (b.y1 - b.y0) * 0.1 });

/** A toilet you can't mistake: tank, lid up, seat and bowl, plus a plunger and a mat. */
function paintToilet(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const { x: cx, y: sy } = toiletSeat(b);
  const porcelain = (x0: number, x1: number) => {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#eef3f6');
    g.addColorStop(1, '#c4cfd8');
    return g;
  };
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // The tank, its lid, the flush handle and a spare roll on top.
  const tw = w * 0.82;
  const tTop = b.y0 - h * 0.85;
  c.fillStyle = porcelain(cx - tw / 2, cx + tw / 2);
  rect(c, cx - tw / 2, tTop, tw, sy - tTop + h * 0.04, 4);
  c.fill();
  c.stroke();
  rect(c, cx - tw / 2 - 2, tTop - 5, tw + 4, 6, 2);
  c.fill();
  c.stroke();
  c.fillStyle = chrome(c, tTop + 6, tTop + 10);
  rect(c, cx - tw / 2 + 3, tTop + 6, Math.max(6, w * 0.16), 3, 1.5);
  c.fill();
  const rr = Math.max(3, w * 0.12);
  c.fillStyle = '#fbfaf4';
  c.lineWidth = 1;
  rect(c, cx + tw / 2 - rr * 2 - 2, tTop - 5 - rr * 1.6, rr * 1.8, rr * 1.6, 1.5);
  c.fill();
  c.stroke();
  c.fillStyle = '#c9b48e';
  c.beginPath();
  c.ellipse(cx + tw / 2 - rr * 1.1 - 2, tTop - 5 - rr * 1.6, rr * 0.3, rr * 0.18, 0, 0, TAU);
  c.fill();
  // The lid, raised against the tank.
  c.lineWidth = 1.5;
  c.fillStyle = porcelain(cx - w * 0.36, cx + w * 0.36);
  c.beginPath();
  c.ellipse(cx, b.y0 - h * 0.3, w * 0.36, h * 0.42, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.strokeStyle = 'rgba(31,26,36,0.25)';
  c.lineWidth = 1;
  c.beginPath();
  c.ellipse(cx, b.y0 - h * 0.3, w * 0.26, h * 0.31, 0, 0, TAU);
  c.stroke();
  // The bowl, narrowing to its foot.
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = porcelain(cx - w * 0.47, cx + w * 0.47);
  c.beginPath();
  c.moveTo(cx - w * 0.47, sy + h * 0.02);
  c.quadraticCurveTo(cx - w * 0.46, sy + h * 0.42, cx - w * 0.2, sy + h * 0.52);
  c.lineTo(cx - w * 0.25, b.y1);
  c.lineTo(cx + w * 0.25, b.y1);
  c.lineTo(cx + w * 0.2, sy + h * 0.52);
  c.quadraticCurveTo(cx + w * 0.46, sy + h * 0.42, cx + w * 0.47, sy + h * 0.02);
  c.closePath();
  c.fill();
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(cx - w * 0.36, sy + h * 0.14);
  c.quadraticCurveTo(cx - w * 0.33, sy + h * 0.36, cx - w * 0.16, sy + h * 0.44);
  c.stroke();
  // The seat ring, with water in the bowl.
  c.strokeStyle = INK;
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.ellipse(cx, sy, w * 0.5, h * 0.12, 0, 0, TAU);
  c.fill();
  c.stroke();
  const water = c.createLinearGradient(0, sy - h * 0.07, 0, sy + h * 0.07);
  water.addColorStop(0, '#5f9fc0');
  water.addColorStop(1, '#a8d8ee');
  c.fillStyle = water;
  c.lineWidth = 1;
  c.beginPath();
  c.ellipse(cx, sy + h * 0.005, w * 0.33, h * 0.065, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath();
  c.ellipse(cx - w * 0.1, sy - h * 0.02, w * 0.1, h * 0.015, 0, 0, TAU);
  c.fill();
  // A fluffy mat in front, and the plunger beside it.
  c.fillStyle = '#86bfe0';
  c.beginPath();
  c.ellipse(cx, b.y1 + 1.5, w * 0.58, 3, 0, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.setLineDash([1.5, 2]);
  c.stroke();
  c.setLineDash([]);
  const px = b.x1 + Math.max(4, w * 0.1);
  const cup = Math.max(4, w * 0.11);
  c.strokeStyle = '#a8743f';
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(px, b.y1 - cup * 0.9);
  c.lineTo(px - 1, b.y1 - h * 0.62);
  c.stroke();
  c.lineCap = 'butt';
  c.fillStyle = '#c8322b';
  c.strokeStyle = INK;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(px - cup, b.y1);
  c.quadraticCurveTo(px - cup, b.y1 - cup * 1.1, px, b.y1 - cup * 1.1);
  c.quadraticCurveTo(px + cup, b.y1 - cup * 1.1, px + cup, b.y1);
  c.closePath();
  c.fill();
  c.stroke();
}

function paintChair(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // A tufted back.
  const bx = b.x0 + w * 0.05;
  const by = b.y0 - h * 0.35;
  const bw = w * 0.9;
  const bh = h * 0.8;
  const back = c.createLinearGradient(bx, by, bx + bw * 0.6, by + bh);
  back.addColorStop(0, '#a466cc');
  back.addColorStop(1, '#6a338c');
  c.fillStyle = back;
  rect(c, bx, by, bw, bh, 9);
  c.fill();
  c.stroke();
  // Diamond tufting: rows of buttons, offset, joined by creases.
  const buttons: (readonly [number, number])[] = [];
  for (let row = 0; row < 4; row++) {
    const us = row % 2 ? [0.375, 0.625] : [0.25, 0.5, 0.75];
    for (const u of us) buttons.push([bx + bw * u, by + bh * (0.14 + row * 0.17)]);
  }
  c.strokeStyle = 'rgba(40,10,60,0.3)';
  c.lineWidth = 1;
  c.beginPath();
  for (const [x, y] of buttons) {
    for (const [x1, y1] of buttons) {
      if (y1 <= y || y1 - y > bh * 0.2 || Math.abs(x1 - x) > bw * 0.15) continue;
      c.moveTo(x, y);
      c.lineTo(x1, y1);
    }
  }
  c.stroke();
  for (const [x, y] of buttons) {
    c.fillStyle = '#45195f';
    c.beginPath();
    c.arc(x, y, Math.max(1.3, w * 0.02), 0, TAU);
    c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(bx + 8, by + 3);
  c.lineTo(bx + bw - 8, by + 3);
  c.stroke();
  // Seat cushion.
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  const seat = c.createLinearGradient(0, b.y0 + h * 0.35, 0, b.y0 + h * 0.8);
  seat.addColorStop(0, '#ad72d4');
  seat.addColorStop(1, '#7b3fa0');
  c.fillStyle = seat;
  rect(c, b.x0, b.y0 + h * 0.35, w, h * 0.45, 6);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.fillRect(b.x0 + 7, b.y0 + h * 0.35 + 2, w - 14, 1.5);
  // The shape of him, worn into the cushion, and the crumbs he left.
  c.fillStyle = 'rgba(60,30,10,0.28)';
  c.beginPath();
  c.ellipse(b.x0 + w * 0.52, b.y0 + h * 0.5, w * 0.22, h * 0.07, 0.1, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(60,30,10,0.18)';
  c.beginPath();
  c.ellipse(b.x0 + w * 0.36, b.y0 + h * 0.62, w * 0.08, h * 0.04, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#e0b56a';
  for (let i = 0; i < 6; i++) c.fillRect(b.x0 + w * (0.25 + hash(i, 5) * 0.5), b.y0 + h * (0.4 + hash(i, 6) * 0.3), 1.5, 1.5);
  // Rolled arms.
  for (const x of [b.x0 - w * 0.02, b.x1 - w * 0.16]) {
    const arm = c.createLinearGradient(x, 0, x + w * 0.18, 0);
    arm.addColorStop(0, '#9a5cc4');
    arm.addColorStop(1, '#6e3792');
    c.fillStyle = arm;
    rect(c, x, b.y0 + h * 0.15, w * 0.18, h * 0.55, 5);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath();
    c.ellipse(x + w * 0.09, b.y0 + h * 0.15 + 4, w * 0.06, 2, 0, 0, TAU);
    c.fill();
  }
  // Tapered wooden legs.
  c.fillStyle = '#5a3b22';
  for (const lx of [b.x0 + w * 0.1, b.x1 - w * 0.18]) {
    c.beginPath();
    c.moveTo(lx, b.y1 - h * 0.2);
    c.lineTo(lx + w * 0.08, b.y1 - h * 0.2);
    c.lineTo(lx + w * 0.065, b.y1);
    c.lineTo(lx + w * 0.015, b.y1);
    c.closePath();
    c.fill();
  }
}

/** The duvet's colours, shared with the blanket that tucks him in. */
export const DUVET = ['#7695e6', '#4565c2'] as const;

function paintBed(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // Headboard: rounded wood with a grain.
  const hw = w * 0.08;
  const wood = c.createLinearGradient(b.x0, 0, b.x0 + hw, 0);
  wood.addColorStop(0, '#7d5436');
  wood.addColorStop(1, '#4e3220');
  c.fillStyle = wood;
  rect(c, b.x0, b.y0 - h * 0.8, hw, h * 1.8, [hw * 0.6, hw * 0.6, 2, 2]);
  c.fill();
  c.stroke();
  c.strokeStyle = 'rgba(30,15,5,0.3)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(b.x0 + hw * 0.35, b.y0 - h * 0.6);
  c.quadraticCurveTo(b.x0 + hw * 0.55, b.y0, b.x0 + hw * 0.35, b.y1 - 3);
  c.moveTo(b.x0 + hw * 0.7, b.y0 - h * 0.4);
  c.quadraticCurveTo(b.x0 + hw * 0.5, b.y0 + h * 0.3, b.x0 + hw * 0.7, b.y1 - 3);
  c.stroke();
  // Frame: a wooden panel with an inset.
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  const fy = b.y0 + h * 0.4;
  const fh = h * 0.6;
  const frame = c.createLinearGradient(0, fy, 0, b.y1);
  frame.addColorStop(0, '#6e472b');
  frame.addColorStop(1, '#46291a');
  c.fillStyle = frame;
  c.fillRect(b.x0, fy, w, fh);
  c.strokeRect(b.x0, fy, w, fh);
  c.strokeStyle = 'rgba(255,220,180,0.16)';
  c.lineWidth = 1;
  c.strokeRect(b.x0 + w * 0.12, fy + fh * 0.3, w * 0.82, fh * 0.42);
  // Mattress.
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = '#f4f1ea';
  rect(c, b.x0 + w * 0.06, b.y0, w * 0.94, h * 0.45, 5);
  c.fill();
  c.stroke();
  // The duvet over the foot of the bed, hanging over the side.
  const dx0 = b.x0 + w * 0.36;
  const dx1 = b.x1 + 1.5;
  const dg = c.createLinearGradient(0, b.y0 - 3, 0, b.y0 + h * 0.78);
  dg.addColorStop(0, DUVET[0]);
  dg.addColorStop(1, DUVET[1]);
  c.fillStyle = dg;
  c.beginPath();
  c.moveTo(dx0, b.y0 - 1);
  c.quadraticCurveTo((dx0 + dx1) / 2, b.y0 - 5, dx1, b.y0 - 1);
  c.lineTo(dx1, b.y0 + h * 0.72);
  c.quadraticCurveTo(dx1 - (dx1 - dx0) * 0.25, b.y0 + h * 0.8, (dx0 + dx1) / 2, b.y0 + h * 0.72);
  c.quadraticCurveTo(dx0 + (dx1 - dx0) * 0.25, b.y0 + h * 0.64, dx0, b.y0 + h * 0.7);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 9; i++) {
    const u = hash(i, 3);
    const v = hash(i, 9);
    c.beginPath();
    c.arc(dx0 + 6 + u * (dx1 - dx0 - 10), b.y0 + 3 + v * h * 0.6, 1.1, 0, TAU);
    c.fill();
  }
  c.strokeStyle = 'rgba(20,30,90,0.3)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(dx0 + (dx1 - dx0) * 0.3, b.y0 + 2);
  c.quadraticCurveTo(dx0 + (dx1 - dx0) * 0.36, b.y0 + h * 0.4, dx0 + (dx1 - dx0) * 0.3, b.y0 + h * 0.66);
  c.moveTo(dx0 + (dx1 - dx0) * 0.68, b.y0 + 1);
  c.quadraticCurveTo(dx0 + (dx1 - dx0) * 0.62, b.y0 + h * 0.4, dx0 + (dx1 - dx0) * 0.7, b.y0 + h * 0.7);
  c.stroke();
  // The turned-down edge.
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = '#b9c9f4';
  rect(c, dx0 - 2, b.y0 - 2, Math.max(5, (dx1 - dx0) * 0.09), h * 0.62, 3);
  c.fill();
  c.stroke();
  // Pillow.
  const px = b.x0 + w * 0.1;
  const py = b.y0 - h * 0.25;
  const pg = c.createLinearGradient(0, py, 0, py + h * 0.32);
  pg.addColorStop(0, '#ffffff');
  pg.addColorStop(1, '#dcdfe8');
  c.fillStyle = pg;
  rect(c, px, py, w * 0.22, h * 0.32, 7);
  c.fill();
  c.stroke();
  c.strokeStyle = 'rgba(80,90,120,0.3)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(px + w * 0.11, py + 3);
  c.quadraticCurveTo(px + w * 0.09, py + h * 0.16, px + w * 0.11, py + h * 0.3);
  c.stroke();
  // Drool on the pillow, crumbs in the bed.
  c.fillStyle = 'rgba(200,180,90,0.4)';
  c.beginPath();
  c.ellipse(px + w * 0.15, py + h * 0.22, w * 0.045, h * 0.06, 0.4, 0, TAU);
  c.fill();
  c.fillStyle = '#e0b56a';
  for (let i = 0; i < 8; i++) c.fillRect(b.x0 + w * (0.42 + hash(i, 11) * 0.5), b.y0 + h * (0.02 + hash(i, 12) * 0.3), 1.5, 1.5);
}

function paintDesk(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const deskY = b.y1 - h * 0.45;
  const dx0 = b.x0 + w * 0.35;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // The desk: a dark top with a lit edge, two legs and a brace.
  c.fillStyle = '#2b2b33';
  c.fillRect(dx0 + 2, deskY + (b.y1 - deskY) * 0.55, w * 0.65 - 6, 2);
  c.fillRect(dx0 + w * 0.03, deskY, 4, b.y1 - deskY);
  c.fillRect(b.x1 - 6, deskY, 4, b.y1 - deskY);
  c.fillRect(dx0, deskY, w * 0.65, 5);
  c.strokeRect(dx0, deskY, w * 0.65, 5);
  c.fillStyle = 'rgba(255,255,255,0.2)';
  c.fillRect(dx0 + 1, deskY + 0.8, w * 0.65 - 2, 1);
  // The tower under the desk, with a glass side for the fans.
  const tx = b.x1 - w * 0.2;
  const ty = b.y1 - h * 0.38;
  const tw = w * 0.15;
  const th = h * 0.38;
  c.fillStyle = '#1b1b22';
  rect(c, tx, ty, tw, th, 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#0b0d12';
  rect(c, tx + tw * 0.12, ty + th * 0.1, tw * 0.76, th * 0.66, 2);
  c.fill();
  c.fillStyle = '#3a3d48';
  for (let i = 0; i < 3; i++) c.fillRect(tx + tw * 0.2, ty + th * (0.83 + i * 0.05), tw * 0.6, 1);
  // Keyboard, mouse and an energy drink on the desk.
  c.fillStyle = '#16171d';
  rect(c, b.x0 + w * 0.55, deskY - 3, w * 0.3, 3, 1);
  c.fill();
  c.beginPath();
  c.ellipse(b.x0 + w * 0.92, deskY - 1.6, Math.max(2.5, w * 0.022), 1.8, 0, 0, TAU);
  c.fill();
  const can = { x: b.x0 + w * 0.39, w: Math.max(4, w * 0.035), h: Math.max(8, h * 0.11) };
  c.fillStyle = '#4fc65e';
  rect(c, can.x, deskY - can.h, can.w, can.h, 1);
  c.fill();
  c.fillStyle = '#1b1b22';
  c.fillRect(can.x, deskY - can.h * 0.62, can.w, can.h * 0.3);
  c.fillStyle = '#c8d0d8';
  c.fillRect(can.x, deskY - can.h - 1, can.w, 1.5);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillRect(can.x + 1, deskY - can.h + 1, 1, can.h - 2);
  // The gaming chair, facing you: winged red back, headrest, seat, arms and wheels.
  const ccx = b.x0 + w * 0.15;
  const bw = Math.max(18, w * 0.26);
  const bTop = b.y1 - h * 0.86;
  const bBot = b.y1 - h * 0.36;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  const red = c.createLinearGradient(ccx - bw / 2, 0, ccx + bw / 2, 0);
  red.addColorStop(0, '#ee5248');
  red.addColorStop(1, '#b0241e');
  c.fillStyle = red;
  c.beginPath();
  c.moveTo(ccx - bw * 0.36, bTop);
  c.lineTo(ccx + bw * 0.36, bTop);
  c.quadraticCurveTo(ccx + bw * 0.5, bTop + (bBot - bTop) * 0.45, ccx + bw * 0.5, bBot);
  c.lineTo(ccx - bw * 0.5, bBot);
  c.quadraticCurveTo(ccx - bw * 0.5, bTop + (bBot - bTop) * 0.45, ccx - bw * 0.36, bTop);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#1b1b22';
  rect(c, ccx - bw * 0.22, bTop + (bBot - bTop) * 0.26, bw * 0.44, (bBot - bTop) * 0.7, 3);
  c.fill();
  rect(c, ccx - bw * 0.2, bTop + 3, bw * 0.4, (bBot - bTop) * 0.13, 3);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 1;
  c.setLineDash([2, 2]);
  c.beginPath();
  c.moveTo(ccx - bw * 0.3, bTop + 4);
  c.lineTo(ccx - bw * 0.4, bBot - 3);
  c.moveTo(ccx + bw * 0.3, bTop + 4);
  c.lineTo(ccx + bw * 0.4, bBot - 3);
  c.stroke();
  c.setLineDash([]);
  // Arms.
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  for (const sx of [-1, 1]) {
    const ax = ccx + sx * bw * 0.62;
    c.fillStyle = '#4a4f58';
    c.fillRect(ax - 1.5, b.y1 - h * 0.46, 3, h * 0.12);
    c.fillStyle = '#1b1b22';
    rect(c, ax - bw * 0.14, b.y1 - h * 0.48, bw * 0.28, 4, 2);
    c.fill();
    c.stroke();
  }
  // Seat cushion with red piping.
  c.fillStyle = '#1b1b22';
  rect(c, ccx - bw * 0.62, b.y1 - h * 0.37, bw * 1.24, h * 0.08, 4);
  c.fill();
  c.stroke();
  c.fillStyle = '#d6332b';
  c.fillRect(ccx - bw * 0.55, b.y1 - h * 0.37 + h * 0.08 - 2.5, bw * 1.1, 1.5);
  // Gas lift and a five-star base on wheels.
  const lg = c.createLinearGradient(ccx - 2, 0, ccx + 2, 0);
  lg.addColorStop(0, '#e9edf0');
  lg.addColorStop(1, '#7d8893');
  c.fillStyle = lg;
  c.fillRect(ccx - 2, b.y1 - h * 0.29, 4, h * 0.2);
  c.strokeStyle = '#1b1b22';
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  const hub = b.y1 - h * 0.09;
  const feet: [number, number][] = [
    [-bw * 0.7, b.y1 - 3],
    [-bw * 0.3, b.y1 - 1.5],
    [bw * 0.3, b.y1 - 1.5],
    [bw * 0.7, b.y1 - 3],
  ];
  c.beginPath();
  for (const [dx, fy] of feet) {
    c.moveTo(ccx, hub);
    c.lineTo(ccx + dx, fy);
  }
  c.stroke();
  c.lineCap = 'butt';
  c.fillStyle = '#2b2b33';
  for (const [dx, fy] of feet) {
    c.beginPath();
    c.arc(ccx + dx, fy + 1, 2, 0, TAU);
    c.fill();
  }
}

/** Things that change: the monitor, the plant, the fridge door, the oven, the scientist. */
export function drawMonitor(c: Ctx, b: Box, t: number, on: boolean): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const mx = b.x0 + w * 0.48;
  const my = b.y0;
  const mw = w * 0.46;
  const mh = h * 0.42;
  const hue = (t * 0.05) % 360;
  if (on) {
    // The screen lights up the wall around it.
    const g = c.createRadialGradient(mx + mw / 2, my + mh / 2, 0, mx + mw / 2, my + mh / 2, mw * 1.2);
    g.addColorStop(0, `hsla(${hue},85%,62%,0.3)`);
    g.addColorStop(1, `hsla(${hue},85%,62%,0)`);
    c.fillStyle = g;
    c.fillRect(mx - mw * 0.7, my - mw * 0.7, mw * 2.4, mh + mw * 1.4);
  }
  c.fillStyle = '#111';
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  rect(c, mx, my, mw, mh, 3);
  c.fill();
  c.stroke();
  c.fillRect(mx + mw * 0.45, my + mh, mw * 0.1, h * 0.13);
  c.fillRect(mx + mw * 0.32, my + mh + h * 0.12, mw * 0.36, 2);
  const sx = mx + 3;
  const sy = my + 3;
  const sw = mw - 6;
  const sh = mh - 6;
  c.save();
  c.beginPath();
  c.rect(sx, sy, sw, sh);
  c.clip();
  if (on) {
    // A little platformer: rolling hills, coins, and a hero hopping along.
    const g = c.createLinearGradient(0, sy, 0, sy + sh);
    g.addColorStop(0, `hsl(${hue},70%,42%)`);
    g.addColorStop(1, `hsl(${hue + 50},80%,66%)`);
    c.fillStyle = g;
    c.fillRect(sx, sy, sw, sh);
    c.fillStyle = 'rgba(30,110,60,0.95)';
    c.beginPath();
    c.moveTo(sx, sy + sh);
    for (let x = 0; x <= sw; x += 3) c.lineTo(sx + x, sy + sh * 0.74 + Math.sin((x + t * 0.04) * 0.09) * sh * 0.07);
    c.lineTo(sx + sw, sy + sh);
    c.fill();
    c.fillStyle = '#ffd34d';
    for (let i = 0; i < 3; i++) {
      const x = sx + sw - ((t * 0.04 + (i * sw) / 3) % sw);
      c.beginPath();
      c.arc(x, sy + sh * 0.38 + (i % 2) * sh * 0.1, Math.max(1.5, sh * 0.05), 0, TAU);
      c.fill();
    }
    const jy = sy + sh * 0.62 - Math.abs(Math.sin(t * 0.004)) * sh * 0.3;
    const js = Math.max(4, sh * 0.13);
    c.fillStyle = '#ff6fa8';
    c.fillRect(sx + sw * 0.3 - js / 2, jy - js, js, js);
    c.fillStyle = '#fff';
    c.fillRect(sx + sw * 0.3, jy - js * 0.75, js * 0.25, js * 0.25);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = `700 ${Math.max(5, Math.round(sh * 0.13))}px Rubik, system-ui, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(`${Math.floor(t / 900) % 1000}`.padStart(3, '0'), sx + 3, sy + 2);
    // Scanlines.
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = sy; y < sy + sh; y += 3) c.fillRect(sx, y, sw, 1);
  } else {
    c.fillStyle = '#1e2a36';
    c.fillRect(sx, sy, sw, sh);
  }
  c.fillStyle = 'rgba(255,255,255,0.07)';
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(sx + sw * 0.45, sy);
  c.lineTo(sx + sw * 0.15, sy + sh);
  c.lineTo(sx, sy + sh);
  c.fill();
  c.restore();

  // RGB everywhere: the strip under the desk, the keyboard and the fans.
  const k = (Math.sin(t * 0.003) + 1) / 2;
  const deskY = b.y1 - h * 0.45;
  c.fillStyle = `rgba(${Math.round(120 + 135 * k)},80,${Math.round(255 - 100 * k)},0.85)`;
  c.fillRect(b.x0 + w * 0.35, deskY + 5, w * 0.65, 2);
  glow(c, b.x0 + w * 0.67, deskY + 7, w * 0.28, [Math.round(120 + 135 * k), 80, Math.round(255 - 100 * k)], 0.16);
  const kb = c.createLinearGradient(b.x0 + w * 0.55, 0, b.x0 + w * 0.85, 0);
  for (let i = 0; i <= 4; i++) kb.addColorStop(i / 4, `hsl(${(hue + i * 70) % 360},90%,62%)`);
  c.fillStyle = kb;
  c.fillRect(b.x0 + w * 0.56, deskY - 3, w * 0.28, 1.2);
  const tx = b.x1 - w * 0.2;
  const ty = b.y1 - h * 0.38;
  const tw = w * 0.15;
  const th = h * 0.38;
  const fr = Math.min(tw * 0.3, th * 0.15);
  for (let i = 0; i < 2; i++) {
    const fx = tx + tw / 2;
    const fy = ty + th * (0.28 + i * 0.32);
    const col = `hsl(${(hue + 120 + i * 60) % 360},90%,60%)`;
    c.strokeStyle = col;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(fx, fy, fr, 0, TAU);
    c.stroke();
    c.strokeStyle = 'rgba(200,210,230,0.5)';
    c.lineWidth = 1;
    c.beginPath();
    const a = t * 0.02 + i;
    for (let j = 0; j < 3; j++) {
      c.moveTo(fx, fy);
      c.lineTo(fx + Math.cos(a + (j * TAU) / 3) * fr * 0.8, fy + Math.sin(a + (j * TAU) / 3) * fr * 0.8);
    }
    c.stroke();
  }
}

/** 0 is a happy plant, 1 is dead. */
/** lean: -1 to 1, the plant leaning away from him (toward that side). */
export function drawPlant(c: Ctx, b: Box, wilt: number, t: number, lean = 0): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const green: RGB = [Math.round(70 + 90 * wilt), Math.round(170 - 90 * wilt), Math.round(70 - 30 * wilt)];
  const dark: RGB = [Math.round(green[0] * 0.6), Math.round(green[1] * 0.6), Math.round(green[2] * 0.6)];
  const cx = (b.x0 + b.x1) / 2;
  const base = b.y1 - h * 0.35;
  const sway = Math.sin(t * 0.0015) * 0.05 + lean * 0.35;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  for (const a of [-0.9, -0.4, 0, 0.45, 0.95]) {
    const droop = wilt * 1.2;
    const ang = -Math.PI / 2 + a * (1 + droop * 0.6) + sway;
    const len = h * 0.62 * (1 - wilt * 0.25);
    const ex = cx + Math.cos(ang) * len;
    const ey = base + Math.sin(ang) * len + droop * h * 0.25;
    const mx = cx + Math.cos(ang) * len * 0.5;
    const my = base + Math.sin(ang) * len * 0.5;
    const g = c.createLinearGradient(mx - 4, my, mx + 4, my);
    g.addColorStop(0, rgba(green, 1));
    g.addColorStop(1, rgba(dark, 1));
    c.fillStyle = g;
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx, base);
    c.quadraticCurveTo(mx - 4, my, ex, ey);
    c.quadraticCurveTo(mx + 4, my, cx, base);
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(255,255,230,0.45)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx, base);
    c.quadraticCurveTo(mx, my, ex, ey);
    c.stroke();
  }
  // The pot, with a rim and a shine.
  const pot = c.createLinearGradient(b.x0, 0, b.x1, 0);
  pot.addColorStop(0, '#d9784a');
  pot.addColorStop(1, '#9c4e2a');
  c.fillStyle = pot;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(b.x0 + w * 0.14, b.y1 - h * 0.28);
  c.lineTo(b.x1 - w * 0.14, b.y1 - h * 0.28);
  c.lineTo(b.x1 - w * 0.22, b.y1);
  c.lineTo(b.x0 + w * 0.22, b.y1);
  c.closePath();
  c.fill();
  c.stroke();
  rect(c, b.x0 + w * 0.08, b.y1 - h * 0.36, w * 0.84, h * 0.09, 2);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fillRect(b.x0 + w * 0.26, b.y1 - h * 0.24, 1.5, h * 0.18);
}

export function drawFridge(c: Ctx, b: Box, open: number): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  const body = c.createLinearGradient(b.x0, 0, b.x1, 0);
  body.addColorStop(0, '#fbfdfe');
  body.addColorStop(0.7, '#e7edf1');
  body.addColorStop(1, '#c9d2d9');
  c.fillStyle = body;
  rect(c, b.x0, b.y0, w, h, 5);
  c.fill();
  c.stroke();
  if (open > 0) {
    // Lit up inside: shelves, milk, the steak, some bottles and the salad drawer.
    const ig = c.createLinearGradient(0, b.y0, 0, b.y1);
    ig.addColorStop(0, '#fffbe6');
    ig.addColorStop(1, '#efe6c8');
    c.fillStyle = ig;
    c.fillRect(b.x0 + 3, b.y0 + 3, w - 6, h - 6);
    c.fillStyle = 'rgba(150,170,185,0.9)';
    for (const v of [0.32, 0.56, 0.78]) c.fillRect(b.x0 + 3, b.y0 + h * v, w - 6, 2.5);
    c.fillStyle = '#9fd8f0';
    c.fillRect(b.x0 + w * 0.15, b.y0 + h * 0.32 - h * 0.06, w * 0.4, h * 0.06);
    c.fillStyle = '#ffffff';
    c.fillRect(b.x0 + w * 0.12, b.y0 + h * 0.56 - h * 0.14, w * 0.18, h * 0.14);
    c.fillStyle = '#4f86c6';
    c.fillRect(b.x0 + w * 0.12, b.y0 + h * 0.56 - h * 0.09, w * 0.18, h * 0.03);
    c.fillStyle = '#e8566a';
    c.beginPath();
    c.ellipse(b.x0 + w * 0.62, b.y0 + h * 0.53, w * 0.2, h * 0.035, 0, 0, TAU);
    c.fill();
    for (const [u, col] of [
      [0.22, '#5fae4e'],
      [0.42, '#ff9a3c'],
      [0.62, '#5fae4e'],
    ] as const) {
      c.fillStyle = col;
      rect(c, b.x0 + w * u, b.y0 + h * 0.78 - h * 0.13, w * 0.1, h * 0.13, 2);
      c.fill();
    }
    c.fillStyle = 'rgba(190,230,200,0.7)';
    c.fillRect(b.x0 + 5, b.y0 + h * 0.8, w - 10, h * 0.16);
    glow(c, b.x0 + w / 2, b.y0 + 6, w * 0.6, [255, 250, 220], 0.6);
    // Cold light spilling out across the floor.
    flatGlow(c, b.x0 - w * 0.2, b.y1, w * 1.5, w * 0.25, [255, 250, 225], 0.4);
    glow(c, b.x0, b.y0 + h * 0.5, w * 1.1, [255, 250, 225], 0.16);
    // The door, swung out, with bottles in its racks.
    const dw = w * 0.55 * open;
    const dg = c.createLinearGradient(b.x0 - dw, 0, b.x0, 0);
    dg.addColorStop(0, '#c9d2d9');
    dg.addColorStop(1, '#eef2f5');
    c.fillStyle = dg;
    rect(c, b.x0 - dw, b.y0, dw, h, 4);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(150,170,185,0.9)';
    for (const v of [0.45, 0.72]) c.fillRect(b.x0 - dw + 3, b.y0 + h * v, dw - 6, 3);
    c.fillStyle = '#d6332b';
    rect(c, b.x0 - dw * 0.75, b.y0 + h * 0.45 - h * 0.1, dw * 0.22, h * 0.1, 1.5);
    c.fill();
    c.fillStyle = '#f2c14e';
    rect(c, b.x0 - dw * 0.42, b.y0 + h * 0.45 - h * 0.08, dw * 0.2, h * 0.08, 1.5);
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(b.x0, b.y0 + h * 0.32);
    c.lineTo(b.x1, b.y0 + h * 0.32);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillRect(b.x0 + 2, b.y0 + h * 0.32 + 1.5, w - 4, 1);
    for (const [v, hh] of [
      [0.12, 0.14],
      [0.4, 0.2],
    ] as const) {
      const hx = b.x0 + w * 0.1;
      const g = c.createLinearGradient(hx, 0, hx + 4, 0);
      g.addColorStop(0, '#f4f7f9');
      g.addColorStop(1, '#7d8893');
      c.fillStyle = g;
      rect(c, hx, b.y0 + h * v, 4, h * hh, 2);
      c.fill();
    }
    // The FEED HIM note under a magnet, a few other magnets, and a drawing of him.
    const nw = w * 0.44;
    const nh = nw * 0.9;
    c.save();
    c.translate(b.x0 + w * 0.64, b.y0 + h * 0.5 + nh / 2);
    c.rotate(0.06);
    c.fillStyle = '#fff6c9';
    c.fillRect(-nw / 2, -nh / 2, nw, nh);
    c.strokeStyle = 'rgba(31,26,36,0.35)';
    c.lineWidth = 1;
    c.strokeRect(-nw / 2, -nh / 2, nw, nh);
    c.fillStyle = '#d6332b';
    if (nw >= 30) {
      c.font = `800 ${Math.round(nw * 0.25)}px Rubik, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('FEED', 0, -nh * 0.08, nw - 4);
      c.fillText('HIM', 0, nh * 0.24, nw - 4);
    } else {
      for (let i = 0; i < 3; i++) c.fillRect(-nw * 0.32, -nh * 0.15 + i * nh * 0.2, nw * (0.64 - i * 0.12), 1.5);
    }
    c.fillStyle = '#ff3d2e';
    c.beginPath();
    c.arc(0, -nh / 2, Math.max(2, nw * 0.1), 0, TAU);
    c.fill();
    c.restore();
    for (const [u, v, col] of [
      [0.55, 0.12, '#4f86c6'],
      [0.78, 0.2, '#f2c14e'],
      [0.66, 0.24, '#5fae4e'],
    ] as const) {
      c.fillStyle = col;
      c.beginPath();
      c.arc(b.x0 + w * u, b.y0 + h * v, Math.max(1.8, w * 0.045), 0, TAU);
      c.fill();
    }
    const px = b.x0 + w * 0.3;
    const py = b.y0 + h * 0.74;
    const ps = w * 0.3;
    c.fillStyle = '#ffffff';
    c.fillRect(px, py, ps, ps * 1.1);
    c.fillStyle = '#e6a458';
    c.fillRect(px + ps * 0.25, py + ps * 0.2, ps * 0.5, ps * 0.5);
    c.fillStyle = '#2a1a12';
    c.fillRect(px + ps * 0.35, py + ps * 0.35, 1.2, 1.2);
    c.fillRect(px + ps * 0.58, py + ps * 0.35, 1.2, 1.2);
    c.fillStyle = '#e8443a';
    c.fillRect(px + ps * 0.38, py + ps * 0.55, ps * 0.26, 1.2);
  }
  // A sheen down the front.
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(b.x0 + w * 0.82, b.y0 + 4, 1.5, h - 8);
}

/** heat 0..1 is how hot the burner is glowing. */
export function drawOven(c: Ctx, b: Box, heat: number): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  if (heat > 0) glow(c, (b.x0 + b.x1) / 2, b.y0 + h * 0.55, w * 1.4, [255, 140, 50], 0.22 * heat);
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  const body = c.createLinearGradient(b.x0, 0, b.x1, 0);
  body.addColorStop(0, '#525a64');
  body.addColorStop(1, '#2c3036');
  c.fillStyle = body;
  rect(c, b.x0, b.y0, w, h, 3);
  c.fill();
  c.stroke();
  // Control panel: three knobs and a clock.
  c.fillStyle = '#23272c';
  rect(c, b.x0 + 2.5, b.y0 + 2.5, w - 5, h * 0.24, 2);
  c.fill();
  const kr = Math.max(2, w * 0.055);
  for (let i = 0; i < 3; i++) {
    const kx = b.x0 + w * (0.18 + i * 0.17);
    const ky = b.y0 + h * 0.145;
    const g = c.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, 0, kx, ky, kr);
    g.addColorStop(0, '#f2f5f7');
    g.addColorStop(1, '#8f99a2');
    c.fillStyle = g;
    c.beginPath();
    c.arc(kx, ky, kr, 0, TAU);
    c.fill();
    const a = -Math.PI / 2 + (heat > 0 && i === 1 ? 1.8 : 0);
    c.strokeStyle = '#2c3036';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(kx, ky);
    c.lineTo(kx + Math.cos(a) * kr * 0.9, ky + Math.sin(a) * kr * 0.9);
    c.stroke();
  }
  const cdx = b.x0 + w * 0.67;
  const cdw = w * 0.22;
  c.fillStyle = '#0b1612';
  c.fillRect(cdx, b.y0 + h * 0.08, cdw, h * 0.12);
  c.fillStyle = heat > 0 ? '#ff9a3c' : '#5ee0b0';
  c.font = `700 ${Math.max(5, Math.round(h * 0.09))}px ui-monospace, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(heat > 0 ? 'HOT' : '12:00', cdx + cdw / 2, b.y0 + h * 0.145, cdw - 2);
  // Handle bar.
  c.strokeStyle = 'rgba(31,26,36,0.7)';
  c.lineWidth = 1;
  c.fillStyle = chrome(c, b.y0 + h * 0.29, b.y0 + h * 0.29 + 3);
  rect(c, b.x0 + w * 0.15, b.y0 + h * 0.29, w * 0.7, 3, 1.5);
  c.fill();
  c.stroke();
  // Window: dark, or glowing with something cooking.
  c.fillStyle = '#15181c';
  rect(c, b.x0 + w * 0.12, b.y0 + h * 0.37, w * 0.76, h * 0.47, 3);
  c.fill();
  const ix = b.x0 + w * 0.18;
  const iy = b.y0 + h * 0.42;
  const iw = w * 0.64;
  const ih = h * 0.36;
  if (heat > 0) {
    const g = c.createRadialGradient(ix + iw / 2, iy + ih * 0.8, 0, ix + iw / 2, iy + ih * 0.8, iw * 0.7);
    g.addColorStop(0, `rgba(255,200,90,${0.6 + heat * 0.4})`);
    g.addColorStop(1, `rgba(200,60,20,${0.4 + heat * 0.3})`);
    c.fillStyle = g;
  } else {
    c.fillStyle = '#262b31';
  }
  c.fillRect(ix, iy, iw, ih);
  c.strokeStyle = heat > 0 ? '#ffe08a' : 'rgba(255,255,255,0.1)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= 6; i++) c.lineTo(ix + 2 + ((iw - 4) * i) / 6, iy + ih - 3 - (i % 2) * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(ix, iy + ih * 0.45, iw, 1);
  c.beginPath();
  c.moveTo(ix + iw * 0.15, iy);
  c.lineTo(ix + iw * 0.4, iy);
  c.lineTo(ix + iw * 0.2, iy + ih);
  c.lineTo(ix, iy + ih);
  c.lineTo(ix, iy + ih * 0.6);
  c.fill();
  // Kick plate.
  c.fillStyle = '#1b1e22';
  c.fillRect(b.x0 + 2, b.y1 - h * 0.08, w - 4, h * 0.08 - 1);
  // The burner on top, glowing when it's on.
  c.fillStyle = heat > 0 ? `rgba(255,${Math.round(110 - heat * 70)},30,${0.5 + heat * 0.5})` : '#555b62';
  c.fillRect(b.x0 + w * 0.15, b.y0 - 3, w * 0.7, 3);
  if (heat > 0) flatGlow(c, (b.x0 + b.x1) / 2, b.y0 - 2, w * 0.45, 5, [255, 120, 40], 0.5 * heat);
}

/** Where Hammy is, for the scientist: his x, and how close he is to her glass (0 far, 1 right there). */
export interface Watch {
  x: number;
  near: number;
}

/**
 * Dr. Moss at the observation window. She watches him (her eyes follow him),
 * takes notes on a clipboard, and leans back holding her nose when he comes
 * up to the glass. mask: wearing a gas mask. gone: evacuated.
 */
export function drawScientist(c: Ctx, w: Box, mask: boolean, gone: boolean, t: number, watch: Watch = { x: (w.x0 + w.x1) / 2, near: 0 }): { x: number; y: number } {
  const cx = (w.x0 + w.x1) / 2;
  const ww = w.x1 - w.x0;
  const hh = w.y1 - w.y0;
  c.save();
  c.beginPath();
  c.roundRect(w.x0, w.y0, ww, hh, 4);
  c.clip();
  if (gone) {
    const on = Math.sin(t * 0.008) > 0;
    c.fillStyle = on ? 'rgba(255,50,40,0.55)' : 'rgba(80,10,10,0.4)';
    c.fillRect(w.x0, w.y0, ww, hh);
    c.fillStyle = '#ffd0c8';
    // Two lines, sized to fit the window across.
    const size = Math.max(7, Math.min(hh * 0.16, ww * 0.15));
    c.font = `700 ${Math.round(size)}px Rubik, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('EVAC-', cx, w.y0 + hh / 2 - size * 0.6, ww - 6);
    c.fillText('UATED', cx, w.y0 + hh / 2 + size * 0.6, ww - 6);
    glass(c, w, ww, hh);
    c.restore();
    return { x: cx, y: w.y0 };
  }
  const near = Math.max(0, Math.min(1, watch.near));
  // Leaning back from the glass: smaller and higher.
  const back = 1 - near * 0.22;
  const s = Math.min(ww, hh) * 0.32 * back;
  const bob = Math.sin(t * 0.002) * 1.5;
  const hx = cx - (watch.x > cx ? 1 : -1) * near * s * 0.25;
  const hy = w.y0 + hh * 0.48 + bob - near * s * 0.35;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // Lab coat, with lapels, a pocket full of pens and her badge.
  const coat = c.createLinearGradient(cx - s * 1.6, 0, cx + s * 1.6, 0);
  coat.addColorStop(0, '#ffffff');
  coat.addColorStop(1, '#cfd7de');
  c.fillStyle = coat;
  c.beginPath();
  c.ellipse(cx, w.y1 + s * 0.3, s * 1.6, s * 1.2, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#7fa6c9';
  c.beginPath();
  c.moveTo(cx - s * 0.35, w.y1 - s * 0.85);
  c.lineTo(cx, w.y1 - s * 0.2);
  c.lineTo(cx + s * 0.35, w.y1 - s * 0.85);
  c.fill();
  c.beginPath();
  c.moveTo(cx - s * 0.5, w.y1 - s * 0.82);
  c.lineTo(cx, w.y1 - s * 0.05);
  c.lineTo(cx + s * 0.5, w.y1 - s * 0.82);
  c.stroke();
  c.strokeRect(cx + s * 0.55, w.y1 - s * 0.45, s * 0.45, s * 0.4);
  for (const [dx, col] of [
    [0.65, '#d6332b'],
    [0.8, '#4f86c6'],
  ] as const) {
    c.fillStyle = col;
    c.fillRect(cx + s * dx, w.y1 - s * 0.62, 2, s * 0.22);
  }
  const bw = s * 0.62;
  c.fillStyle = '#ffffff';
  c.lineWidth = 1;
  rect(c, cx - s * 1.0, w.y1 - s * 0.62, bw, s * 0.3, 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#4f86c6';
  c.fillRect(cx - s * 1.0, w.y1 - s * 0.62, bw, s * 0.08);
  if (bw >= 16) {
    c.fillStyle = '#1c2836';
    c.font = `800 ${Math.max(5, Math.round(s * 0.13))}px Rubik, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('DR. MOSS', cx - s * 1.0 + bw / 2, w.y1 - s * 0.43, bw - 2);
  }
  c.lineWidth = 1.5;
  c.strokeStyle = INK;
  // Hair: a bun with a pencil through it, and a fringe.
  c.fillStyle = '#4a3324';
  c.beginPath();
  c.arc(hx + s * 0.15, hy - s * 1.02, s * 0.42, 0, TAU);
  c.fill();
  c.stroke();
  c.strokeStyle = '#f2c14e';
  c.lineWidth = Math.max(1.5, s * 0.08);
  c.beginPath();
  c.moveTo(hx - s * 0.35, hy - s * 1.28);
  c.lineTo(hx + s * 0.65, hy - s * 0.8);
  c.stroke();
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // Head.
  const skin = c.createRadialGradient(hx - s * 0.3, hy - s * 0.3, s * 0.1, hx, hy, s);
  skin.addColorStop(0, '#f4c4a0');
  skin.addColorStop(1, '#d99c76');
  c.fillStyle = skin;
  c.beginPath();
  c.arc(hx, hy, s, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#4a3324';
  c.beginPath();
  c.arc(hx, hy - s * 0.2, s * 1.02, Math.PI * 1.02, Math.PI * 1.98);
  c.fill();
  c.beginPath();
  c.ellipse(hx - s * 0.86, hy + s * 0.1, s * 0.2, s * 0.45, 0.1, 0, TAU);
  c.ellipse(hx + s * 0.86, hy + s * 0.1, s * 0.2, s * 0.45, -0.1, 0, TAU);
  c.fill();
  if (mask) {
    c.fillStyle = '#3d4a3a';
    c.beginPath();
    c.ellipse(hx, hy + s * 0.35, s * 0.75, s * 0.55, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#2a3329';
    c.beginPath();
    c.arc(hx, hy + s * 0.75, s * 0.28, 0, TAU);
    c.fill();
    c.stroke();
  } else {
    c.fillStyle = 'rgba(230,110,110,0.35)';
    for (const dx of [-0.55, 0.55]) {
      c.beginPath();
      c.arc(hx + dx * s, hy + s * 0.35, s * 0.16, 0, TAU);
      c.fill();
    }
    // A flat line most of the time; a grimace when he's close.
    c.beginPath();
    if (near > 0.3) {
      c.moveTo(hx - s * 0.25, hy + s * 0.58);
      c.quadraticCurveTo(hx, hy + s * 0.44, hx + s * 0.25, hy + s * 0.58);
    } else {
      c.moveTo(hx - s * 0.22, hy + s * 0.5);
      c.quadraticCurveTo(hx, hy + s * 0.46, hx + s * 0.22, hy + s * 0.52);
    }
    c.stroke();
  }
  // Goggles, and her eyes on him.
  const look = Math.max(-1, Math.min(1, (watch.x - hx) / (ww * 1.5)));
  c.fillStyle = 'rgba(160,220,255,0.8)';
  for (const dx of [-0.42, 0.42]) {
    c.beginPath();
    c.arc(hx + dx * s, hy - s * 0.05, s * 0.32, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#1c2836';
    c.beginPath();
    c.arc(hx + dx * s + look * s * 0.14, hy - s * 0.02 + near * s * 0.05, s * 0.1, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(160,220,255,0.8)';
  }
  c.fillStyle = 'rgba(255,255,255,0.85)';
  for (const dx of [-0.42, 0.42]) {
    c.beginPath();
    c.arc(hx + dx * s - s * 0.12, hy - s * 0.17, s * 0.07, 0, TAU);
    c.fill();
  }
  if (near > 0.3) {
    // Brows down, and a hand pinching her nose.
    c.beginPath();
    c.moveTo(hx - s * 0.7, hy - s * 0.42);
    c.lineTo(hx - s * 0.2, hy - s * 0.32);
    c.moveTo(hx + s * 0.7, hy - s * 0.42);
    c.lineTo(hx + s * 0.2, hy - s * 0.32);
    c.stroke();
    if (!mask) {
      // Her sleeve comes up from the shoulder; the hand pinches her nose.
      const sleeve = () => {
        c.beginPath();
        c.moveTo(cx - s * 1.05, w.y1 + s * 0.1);
        c.quadraticCurveTo(hx - s * 1.25, hy + s * 1.0, hx - s * 0.18, hy + s * 0.3);
      };
      c.lineCap = 'round';
      c.strokeStyle = INK;
      c.lineWidth = s * 0.26 + 3;
      sleeve();
      c.stroke();
      c.strokeStyle = '#eef2f5';
      c.lineWidth = s * 0.26;
      sleeve();
      c.stroke();
      c.lineCap = 'butt';
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.fillStyle = '#e8b08a';
      c.beginPath();
      c.ellipse(hx, hy + s * 0.25, s * 0.22, s * 0.18, 0, 0, TAU);
      c.fill();
      c.stroke();
    }
  }
  // Her clipboard, and the pen going while he's at a safe distance.
  const bx = cx + s * 0.55;
  const by = w.y1 - s * 0.95;
  c.save();
  c.translate(bx, by);
  c.rotate(-0.12);
  c.fillStyle = '#a8743f';
  rect(c, 0, 0, s * 0.75, s * 0.95, 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#ffffff';
  c.fillRect(s * 0.08, s * 0.12, s * 0.59, s * 0.76);
  c.fillStyle = '#9aa7b6';
  for (let i = 0; i < 4; i++) c.fillRect(s * 0.14, s * (0.24 + i * 0.15), s * (0.45 - (i % 2) * 0.15), 1);
  c.fillStyle = '#5c6670';
  c.fillRect(s * 0.25, -s * 0.04, s * 0.25, s * 0.12);
  if (near <= 0.3) {
    const k = (t * 0.003) % 1;
    const penX = s * (0.18 + k * 0.4);
    const penY = s * (0.24 + Math.floor((t * 0.003) % 4) * 0.15);
    c.fillStyle = '#e8b08a';
    c.beginPath();
    c.arc(penX + s * 0.08, penY + s * 0.06, s * 0.13, 0, TAU);
    c.fill();
    c.stroke();
    c.strokeStyle = '#1c2836';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(penX, penY);
    c.lineTo(penX + s * 0.18, penY - s * 0.2);
    c.stroke();
  }
  c.restore();
  glass(c, w, ww, hh);
  c.restore();
  return { x: cx, y: w.y0 };
}

/** The window's own glass: a sheen across whatever is behind it. */
function glass(c: Ctx, w: Box, ww: number, hh: number): void {
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.beginPath();
  c.moveTo(w.x0 + ww * 0.55, w.y0);
  c.lineTo(w.x0 + ww * 0.8, w.y0);
  c.lineTo(w.x0 + ww * 0.35, w.y0 + hh);
  c.lineTo(w.x0 + ww * 0.1, w.y0 + hh);
  c.fill();
}

/**
 * What lives on the walls: the clock (on the player's real time), the
 * camera's recording light and dust drifting in the lamplight.
 */
export function drawWallLife(c: Ctx, m: Room, t: number, now: Date, calm: boolean): void {
  const high = m.loft - m.T;
  const cx = m.L + (m.R - m.L) * 0.4;
  const cy = m.T + high * 0.22;
  const r = Math.max(9, Math.min(22, high * 0.09));
  flatGlow(c, cx + 1, cy + r + 2, r, 3, SHADOW, 0.25);
  c.fillStyle = '#2b2f36';
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.fill();
  const face = c.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  face.addColorStop(0, '#ffffff');
  face.addColorStop(1, '#e4e8ec');
  c.fillStyle = face;
  c.beginPath();
  c.arc(cx, cy, r - 2, 0, TAU);
  c.fill();
  c.strokeStyle = '#2b2f36';
  c.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const k = i % 3 === 0 ? 0.68 : 0.78;
    c.lineWidth = i % 3 === 0 ? 1.4 : 0.8;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k);
    c.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
    c.stroke();
  }
  const sec = now.getSeconds() + now.getMilliseconds() / 1000;
  const min = now.getMinutes() + sec / 60;
  const hr = (now.getHours() % 12) + min / 60;
  const hand = (turns: number, len: number, width: number, col: string) => {
    const a = turns * TAU - Math.PI / 2;
    c.strokeStyle = col;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
    c.lineTo(cx + Math.cos(a) * r * len, cy + Math.sin(a) * r * len);
    c.stroke();
  };
  hand(hr / 12, 0.45, 2, '#2b2f36');
  hand(min / 60, 0.68, 1.4, '#2b2f36');
  hand(sec / 60, 0.74, 0.8, '#e0332a');
  c.lineCap = 'butt';
  c.fillStyle = '#e0332a';
  c.beginPath();
  c.arc(cx, cy, 1.5, 0, TAU);
  c.fill();

  // The camera's recording light.
  const cam = cameraOf(m);
  if (Math.sin(t * 0.004) > -0.2) {
    const lx = cam.x - Math.cos(0.5) * cam.s * 0.4;
    const ly = cam.y + Math.sin(0.5) * cam.s * 0.4 - cam.s * 0.2;
    glow(c, lx, ly, cam.s * 0.5, [255, 60, 50], 0.6);
    c.fillStyle = '#ff3d2e';
    c.beginPath();
    c.arc(lx, ly, Math.max(1.2, cam.s * 0.1), 0, TAU);
    c.fill();
  }

  // Dust in the lamplight.
  if (calm) return;
  const lamps = lampsOf(m);
  c.fillStyle = '#fffbe8';
  for (let i = 0; i < 18; i++) {
    const l = lamps[i % lamps.length];
    const h = l.floor - l.y - 12;
    const sp = 0.004 + hash(i, 1) * 0.006;
    const y = (t * sp * 0.4 + hash(i, 2) * h) % h;
    const spread = l.w * 0.5 + (y / h) * l.w * 0.6;
    const x = l.x + Math.sin(t * 0.0004 * (1 + hash(i, 3)) + i * 2.1) * spread;
    c.globalAlpha = 0.35 * Math.sin((y / h) * Math.PI);
    c.beginPath();
    c.arc(x, l.y + 10 + y, 0.6 + hash(i, 4) * 0.9, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
}

/** The front glass and the cell's frame, drawn over everything. */
export function drawGlass(c: Ctx, m: Room): void {
  const { L, R, T, B, W, H } = m;
  // A faint tint, the frame's shadow on the inside, and reflections.
  c.fillStyle = 'rgba(170,215,255,0.035)';
  c.fillRect(L, T, R - L, B - T);
  fade(c, L, T, R - L, 12, [10, 15, 25], 0.28, 'top');
  fade(c, L, T, 8, B - T, [10, 15, 25], 0.22, 'left');
  fade(c, R - 8, T, 8, B - T, [10, 15, 25], 0.22, 'right');
  const streak = (x0: number, x1: number, lean: number, a: number) => {
    const g = c.createLinearGradient(L + (R - L) * x0, 0, L + (R - L) * x1, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(L + (R - L) * x0, T);
    c.lineTo(L + (R - L) * x1, T);
    c.lineTo(L + (R - L) * (x1 - lean), B);
    c.lineTo(L + (R - L) * (x0 - lean), B);
    c.closePath();
    c.fill();
  };
  streak(0.02, 0.16, 0.12, 0.07);
  streak(0.66, 0.71, 0.12, 0.06);
  streak(0.73, 0.745, 0.12, 0.08);
  fade(c, L, B - 16, R - L, 16, [255, 255, 255], 0.05, 'bottom');
  // Frame, bevelled, with bolts.
  c.fillStyle = '#39414d';
  c.fillRect(0, 0, W, T);
  c.fillRect(0, B, W, H - B);
  c.fillRect(0, 0, L, H);
  c.fillRect(R, 0, W - R, H);
  fade(c, 0, 0, W, T, [255, 255, 255], 0.06, 'top');
  c.fillStyle = 'rgba(255,255,255,0.1)';
  c.fillRect(0, 0, W, 1);
  c.strokeStyle = 'rgba(10,14,20,0.6)';
  c.lineWidth = 2;
  c.strokeRect(L - 1, T - 1, R - L + 2, B - T + 2);
  c.strokeStyle = 'rgba(210,235,255,0.35)';
  c.lineWidth = 1.5;
  c.strokeRect(L, T, R - L, B - T);
  const br = Math.max(1.5, Math.min(2.6, L * 0.22));
  for (let y = T + 30; y < B - 20; y += 90) {
    bolt(c, L / 2, y, br);
    bolt(c, R + (W - R) / 2, y, br);
  }
  // Hazard stripes along the bottom.
  c.save();
  c.beginPath();
  c.rect(0, B + 2, W, H - B - 2);
  c.clip();
  for (let x = -20; x < W + 20; x += 16) {
    c.fillStyle = '#f2c14e';
    c.beginPath();
    c.moveTo(x, H);
    c.lineTo(x + 8, H);
    c.lineTo(x + 8 + (H - B), B);
    c.lineTo(x + (H - B), B);
    c.closePath();
    c.fill();
  }
  fade(c, 0, B + 2, W, H - B - 2, [0, 0, 0], 0.25, 'top');
  c.restore();
  // The sign, on a plate, and a sticker nobody listens to.
  const size = Math.max(8, Math.round(T * 0.34));
  c.font = `700 ${size}px Rubik, system-ui, sans-serif`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const label = 'UNIT 7 · SUBJECT: HAMMY';
  const lw = c.measureText(label).width;
  c.fillStyle = '#2b323c';
  rect(c, L - 2, T / 2 - size * 0.8, lw + 12, size * 1.6, 3);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = '#c9d2db';
  c.fillText(label, L + 4, T / 2 + 0.5);
  const small = Math.max(7, Math.round(T * 0.26));
  c.font = `800 ${small}px Rubik, system-ui, sans-serif`;
  const sticker = 'DO NOT TAP THE GLASS';
  const sw = c.measureText(sticker).width + 12;
  // Beside the hatch if there's room, or out of the way of it.
  const sx = m.hatchX - 26 - sw > L + lw + 20 ? m.hatchX - 26 - sw / 2 : R - sw / 2 - 2;
  if (L + lw + 20 < sx - sw / 2) {
    c.save();
    c.translate(sx, T / 2);
    c.rotate(-0.025);
    c.fillStyle = '#f2c14e';
    rect(c, -sw / 2, -small * 0.8, sw, small * 1.6, 3);
    c.fill();
    c.fillStyle = '#1f1a24';
    c.textAlign = 'center';
    c.fillText(sticker, 0, 0.5);
    c.restore();
  }
}

/** A robot vacuum, side on, heading in `dir`, with its little light blinking. */
export function drawVacuum(c: Ctx, x: number, y: number, s: number, t: number, dir = 1): void {
  flatGlow(c, x, y, s * 1.2, s * 0.18, SHADOW, 0.35);
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // Body: a thick puck with a bumper.
  const g = c.createLinearGradient(0, y - s * 0.55, 0, y - s * 0.05);
  g.addColorStop(0, '#fbfcfd');
  g.addColorStop(1, '#c9d0d8');
  c.fillStyle = g;
  rect(c, x - s, y - s * 0.55, s * 2, s * 0.5, s * 0.25);
  c.fill();
  c.stroke();
  c.fillStyle = '#2c3138';
  c.fillRect(x - s + 1, y - s * 0.24, s * 2 - 2, s * 0.14);
  // The lid and its sensor bump.
  c.fillStyle = '#4a525c';
  c.beginPath();
  c.ellipse(x - dir * s * 0.1, y - s * 0.55, s * 0.35, s * 0.14, 0, Math.PI, TAU);
  c.fill();
  c.stroke();
  // Brushes spinning at the front.
  c.strokeStyle = '#8a929c';
  const a = t * 0.03;
  for (let i = 0; i < 3; i++) {
    const k = a + (i * TAU) / 3;
    c.beginPath();
    c.moveTo(x + dir * s * 0.85, y - s * 0.05);
    c.lineTo(x + dir * (s * 0.85 + Math.cos(k) * s * 0.3), y - s * 0.05 + Math.sin(k) * s * 0.08);
    c.stroke();
  }
  const on = Math.sin(t * 0.01) > 0;
  if (on) glow(c, x + dir * s * 0.62, y - s * 0.4, s * 0.3, [94, 224, 176], 0.5);
  c.fillStyle = on ? '#5ee0b0' : '#1f6f55';
  c.beginPath();
  c.arc(x + dir * s * 0.62, y - s * 0.4, s * 0.08, 0, TAU);
  c.fill();
}

/** A steak: raw, cooked or charcoal. */
export function drawSteak(c: Ctx, x: number, y: number, s: number, kind: 'rawsteak' | 'steak' | 'burnt'): void {
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = kind === 'rawsteak' ? '#e8566a' : kind === 'steak' ? '#8a4a2a' : '#2a211c';
  c.beginPath();
  c.ellipse(x, y, s, s * 0.6, -0.15, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = kind === 'rawsteak' ? '#f7d6d6' : kind === 'steak' ? '#e0b98a' : '#4a3a30';
  c.beginPath();
  c.ellipse(x + s * 0.35, y - s * 0.1, s * 0.25, s * 0.2, 0, 0, TAU);
  c.fill();
  if (kind === 'steak') {
    c.strokeStyle = 'rgba(40,20,10,0.7)';
    for (const dx of [-0.4, 0, 0.4]) {
      c.beginPath();
      c.moveTo(x + dx * s - s * 0.2, y - s * 0.35);
      c.lineTo(x + dx * s + s * 0.2, y + s * 0.35);
      c.stroke();
    }
  }
  if (kind !== 'burnt') {
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.ellipse(x - s * 0.35, y - s * 0.25, s * 0.25, s * 0.09, -0.3, 0, TAU);
    c.fill();
  }
}

/** Where a steak sits in the pan on the stove `b`. */
export const panSpot = (b: Box): { x: number; y: number } => ({ x: (b.x0 + b.x1) / 2, y: b.y0 - 8 });

/** The frying pan on the burner. */
export function drawPan(c: Ctx, b: Box): { x: number; y: number } {
  const cx = (b.x0 + b.x1) / 2;
  const w = b.x1 - b.x0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  const g = c.createLinearGradient(0, b.y0 - 9, 0, b.y0 - 1);
  g.addColorStop(0, '#4a4f56');
  g.addColorStop(1, '#1f2226');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(cx, b.y0 - 5, w * 0.36, 4, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#2a2d31';
  c.fillRect(cx + w * 0.34, b.y0 - 7, w * 0.3, 3);
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(cx + w * 0.36, b.y0 - 7, w * 0.26, 1);
  return panSpot(b);
}
