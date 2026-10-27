// The containment unit: a two-floor glass cell in a lab. Ground floor:
// shower, toilet, armchair, fridge and oven, with an observation window where
// a scientist watches. The loft: bed, a plant and a gaming PC, reached by a
// ladder on the right. This file lays it out and draws the furniture; the
// scene decides what happens in it.

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

function rect(c: Ctx, x: number, y: number, w: number, h: number, r = 0): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Everything that never moves: the lab, the cell, its floors and the furniture's bodies. */
export function paintRoom(c: Ctx, m: Room): void {
  const { W, H, L, R, T, B, ground, loft, loftEnd } = m;
  // The lab outside: dark panels and a warning stripe.
  const lab = c.createLinearGradient(0, 0, 0, H);
  lab.addColorStop(0, '#1b2230');
  lab.addColorStop(1, '#0f131c');
  c.fillStyle = lab;
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,0.04)';
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 34) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, H);
    c.stroke();
  }

  // Inside the cell: tiled back wall, darker downstairs.
  const wall = c.createLinearGradient(0, T, 0, B);
  wall.addColorStop(0, '#d9e2e8');
  wall.addColorStop(1, '#b8c4cc');
  c.fillStyle = wall;
  c.fillRect(L, T, R - L, B - T);
  c.strokeStyle = 'rgba(70,90,110,0.12)';
  const tile = Math.max(14, m.r * 0.9);
  for (let y = T; y < B; y += tile) {
    c.beginPath();
    c.moveTo(L, y);
    c.lineTo(R, y);
    c.stroke();
  }
  for (let x = L; x < R; x += tile) {
    c.beginPath();
    c.moveTo(x, T);
    c.lineTo(x, B);
    c.stroke();
  }
  // Ground floor: concrete.
  c.fillStyle = '#8b939a';
  c.fillRect(L, ground, R - L, B - ground);
  c.fillStyle = '#a7afb5';
  c.fillRect(L, ground, R - L, 2);

  // The loft: a steel deck with a railing, open over the stairwell.
  c.fillStyle = '#5b6470';
  c.fillRect(L, loft, loftEnd - L, LOFT_SLAB);
  c.fillStyle = '#7c8693';
  c.fillRect(L, loft, loftEnd - L, 2);
  c.strokeStyle = '#4a525c';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(loftEnd, loft);
  c.lineTo(loftEnd, loft - m.r * 1.3);
  c.lineTo(loftEnd - m.r * 1.6, loft - m.r * 1.3);
  c.stroke();
  for (let i = 1; i < 3; i++) {
    c.beginPath();
    c.moveTo(loftEnd - i * m.r * 0.55, loft);
    c.lineTo(loftEnd - i * m.r * 0.55, loft - m.r * 1.3);
    c.stroke();
  }

  // Ladder up to the loft.
  const lad = m.ladder;
  c.strokeStyle = '#c99a3c';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(lad.x0, lad.y1);
  c.lineTo(lad.x0 + 3, lad.y0);
  c.moveTo(lad.x1, lad.y1);
  c.lineTo(lad.x1 - 3, lad.y0);
  c.stroke();
  c.lineWidth = 2;
  for (let y = lad.y1 - 12; y > lad.y0 + 4; y -= 14) {
    c.beginPath();
    c.moveTo(lad.x0 + 1, y);
    c.lineTo(lad.x1 - 1, y);
    c.stroke();
  }

  // Observation window, with the lab behind it.
  const w = m.window;
  c.fillStyle = '#202a38';
  rect(c, w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0, 4);
  c.fill();
  c.strokeStyle = '#4b5563';
  c.lineWidth = 3;
  c.stroke();

  paintShower(c, m.shower);
  paintToilet(c, m.toilet);
  paintChair(c, m.chair);
  paintBed(c, m.bed);
  paintDesk(c, m.pc);
}

function paintShower(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  // Tray, back tiles and the head.
  c.fillStyle = '#e8f2f7';
  c.fillRect(b.x0, b.y0, w, b.y1 - b.y0);
  c.strokeStyle = 'rgba(80,120,150,0.25)';
  c.lineWidth = 1;
  for (let y = b.y0 + 10; y < b.y1; y += 10) {
    c.beginPath();
    c.moveTo(b.x0, y);
    c.lineTo(b.x1, y);
    c.stroke();
  }
  c.fillStyle = '#c7d3da';
  c.fillRect(b.x0, b.y1 - 6, w, 6);
  c.strokeStyle = '#8c98a3';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(b.x0 + w * 0.2, b.y0 + 6);
  c.lineTo(b.x0 + w * 0.5, b.y0 + 6);
  c.lineTo(b.x0 + w * 0.5, b.y0 + 16);
  c.stroke();
  c.fillStyle = '#8c98a3';
  c.beginPath();
  c.ellipse(b.x0 + w * 0.5, b.y0 + 18, w * 0.16, 4, 0, 0, TAU);
  c.fill();
}

function paintToilet(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.fillStyle = '#f6f8fa';
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // Tank, then the bowl.
  rect(c, b.x0, b.y0 - h * 0.7, w * 0.42, h * 1.1, 3);
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(b.x0 + w * 0.3, b.y0 + h * 0.1);
  c.lineTo(b.x1, b.y0 + h * 0.1);
  c.quadraticCurveTo(b.x1, b.y0 + h * 0.75, b.x0 + w * 0.62, b.y0 + h * 0.8);
  c.lineTo(b.x0 + w * 0.68, b.y1);
  c.lineTo(b.x0 + w * 0.36, b.y1);
  c.lineTo(b.x0 + w * 0.4, b.y0 + h * 0.75);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#dfe5ea';
  c.fillRect(b.x0 + w * 0.3, b.y0, w * 0.7, h * 0.12);
  c.strokeRect(b.x0 + w * 0.3, b.y0, w * 0.7, h * 0.12);
}

function paintChair(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.fillStyle = '#7b3fa0';
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  rect(c, b.x0 + w * 0.05, b.y0 - h * 0.35, w * 0.9, h * 0.8, 8);
  c.fill();
  c.stroke();
  c.fillStyle = '#9050b8';
  rect(c, b.x0, b.y0 + h * 0.35, w, h * 0.45, 6);
  c.fill();
  c.stroke();
  for (const x of [b.x0 - w * 0.02, b.x1 - w * 0.16]) {
    rect(c, x, b.y0 + h * 0.15, w * 0.18, h * 0.55, 5);
    c.fill();
    c.stroke();
  }
  c.fillStyle = '#3a2a1a';
  c.fillRect(b.x0 + w * 0.1, b.y1 - h * 0.2, w * 0.08, h * 0.2);
  c.fillRect(b.x1 - w * 0.18, b.y1 - h * 0.2, w * 0.08, h * 0.2);
}

function paintBed(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = '#5a3b26';
  rect(c, b.x0, b.y0 - h * 0.8, w * 0.08, h * 1.8, 2);
  c.fill();
  c.stroke();
  c.fillRect(b.x0, b.y0 + h * 0.4, w, h * 0.6);
  c.strokeRect(b.x0, b.y0 + h * 0.4, w, h * 0.6);
  c.fillStyle = '#f4f1ea';
  rect(c, b.x0 + w * 0.06, b.y0, w * 0.94, h * 0.45, 5);
  c.fill();
  c.stroke();
  c.fillStyle = '#ffffff';
  rect(c, b.x0 + w * 0.1, b.y0 - h * 0.25, w * 0.22, h * 0.32, 6);
  c.fill();
  c.stroke();
}

function paintDesk(c: Ctx, b: Box): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const deskY = b.y1 - h * 0.45;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = '#2b2b33';
  c.fillRect(b.x0 + w * 0.35, deskY, w * 0.65, 5);
  c.strokeRect(b.x0 + w * 0.35, deskY, w * 0.65, 5);
  c.fillRect(b.x0 + w * 0.38, deskY, 4, b.y1 - deskY);
  c.fillRect(b.x1 - 6, deskY, 4, b.y1 - deskY);
  // The tower under the desk.
  c.fillStyle = '#1b1b22';
  rect(c, b.x1 - w * 0.2, b.y1 - h * 0.38, w * 0.15, h * 0.38, 2);
  c.fill();
  c.stroke();
  // Gaming chair in front of it.
  c.fillStyle = '#d6332b';
  rect(c, b.x0, b.y1 - h * 0.72, w * 0.16, h * 0.42, 5);
  c.fill();
  c.stroke();
  c.fillStyle = '#1b1b22';
  rect(c, b.x0, b.y1 - h * 0.34, w * 0.3, h * 0.08, 3);
  c.fill();
  c.stroke();
  c.fillRect(b.x0 + w * 0.13, b.y1 - h * 0.26, 3, h * 0.2);
  c.fillRect(b.x0 + w * 0.04, b.y1 - 4, w * 0.22, 3);
}

/** Things that change: the monitor, the plant, the fridge door, the oven, the scientist. */
export function drawMonitor(c: Ctx, b: Box, t: number, on: boolean): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const mx = b.x0 + w * 0.48;
  const my = b.y0;
  const mw = w * 0.46;
  const mh = h * 0.42;
  c.fillStyle = '#111';
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  rect(c, mx, my, mw, mh, 3);
  c.fill();
  c.stroke();
  c.fillRect(mx + mw * 0.45, my + mh, mw * 0.1, h * 0.13);
  if (on) {
    const hue = (t * 0.05) % 360;
    const g = c.createLinearGradient(mx, my, mx + mw, my + mh);
    g.addColorStop(0, `hsl(${hue},80%,55%)`);
    g.addColorStop(1, `hsl(${hue + 90},80%,45%)`);
    c.fillStyle = g;
    c.fillRect(mx + 3, my + 3, mw - 6, mh - 6);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 3; i++) c.fillRect(mx + 6 + ((t * 0.04 + i * 17) % (mw - 14)), my + mh * (0.3 + i * 0.2), 5, 3);
  } else {
    c.fillStyle = '#1e2a36';
    c.fillRect(mx + 3, my + 3, mw - 6, mh - 6);
  }
  // RGB strip under the desk.
  const k = (Math.sin(t * 0.003) + 1) / 2;
  c.fillStyle = `rgba(${Math.round(120 + 135 * k)},80,${Math.round(255 - 100 * k)},0.8)`;
  c.fillRect(b.x0 + w * 0.35, b.y1 - h * 0.45 + 5, w * 0.65, 2);
}

/** 0 is a happy plant, 1 is dead. */
export function drawPlant(c: Ctx, b: Box, wilt: number, t: number): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = '#c0663a';
  c.beginPath();
  c.moveTo(b.x0 + w * 0.1, b.y1 - h * 0.35);
  c.lineTo(b.x1 - w * 0.1, b.y1 - h * 0.35);
  c.lineTo(b.x1 - w * 0.22, b.y1);
  c.lineTo(b.x0 + w * 0.22, b.y1);
  c.closePath();
  c.fill();
  c.stroke();
  const green = [Math.round(70 + 90 * wilt), Math.round(170 - 90 * wilt), Math.round(70 - 30 * wilt)];
  c.fillStyle = `rgb(${green.join(',')})`;
  const cx = (b.x0 + b.x1) / 2;
  const base = b.y1 - h * 0.35;
  const sway = Math.sin(t * 0.0015) * 0.05;
  for (const a of [-0.9, -0.4, 0, 0.45, 0.95]) {
    const droop = wilt * 1.2;
    const ang = -Math.PI / 2 + a * (1 + droop * 0.6) + sway;
    const len = h * 0.62 * (1 - wilt * 0.25);
    const ex = cx + Math.cos(ang) * len;
    const ey = base + Math.sin(ang) * len + droop * h * 0.25;
    c.beginPath();
    c.moveTo(cx, base);
    c.quadraticCurveTo(cx + Math.cos(ang) * len * 0.5 - 4, base + Math.sin(ang) * len * 0.5, ex, ey);
    c.quadraticCurveTo(cx + Math.cos(ang) * len * 0.5 + 4, base + Math.sin(ang) * len * 0.5, cx, base);
    c.fill();
    c.stroke();
  }
}

export function drawFridge(c: Ctx, b: Box, open: number): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = '#eef2f5';
  rect(c, b.x0, b.y0, w, h, 5);
  c.fill();
  c.stroke();
  if (open > 0) {
    // Light, a shelf, and the door swung out.
    c.fillStyle = '#fff8d8';
    c.fillRect(b.x0 + 3, b.y0 + 3, w - 6, h - 6);
    c.fillStyle = '#d0d6db';
    c.fillRect(b.x0 + 3, b.y0 + h * 0.4, w - 6, 3);
    c.fillStyle = '#e8566a';
    c.beginPath();
    c.ellipse(b.x0 + w * 0.5, b.y0 + h * 0.37, w * 0.22, h * 0.04, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#dfe4e8';
    rect(c, b.x0 - w * 0.55 * open, b.y0, w * 0.55 * open, h, 4);
    c.fill();
    c.stroke();
  } else {
    c.beginPath();
    c.moveTo(b.x0, b.y0 + h * 0.32);
    c.lineTo(b.x1, b.y0 + h * 0.32);
    c.stroke();
    c.fillStyle = '#9aa4ad';
    c.fillRect(b.x0 + w * 0.12, b.y0 + h * 0.12, 3, h * 0.14);
    c.fillRect(b.x0 + w * 0.12, b.y0 + h * 0.4, 3, h * 0.2);
    // A magnet that says FEED HIM.
    c.fillStyle = '#ff3d2e';
    c.fillRect(b.x0 + w * 0.5, b.y0 + h * 0.5, w * 0.3, h * 0.08);
  }
}

/** heat 0..1 is how hot the burner is glowing. */
export function drawOven(c: Ctx, b: Box, heat: number): void {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = '#3a3f46';
  rect(c, b.x0, b.y0, w, h, 3);
  c.fill();
  c.stroke();
  c.fillStyle = '#1b1e22';
  rect(c, b.x0 + w * 0.12, b.y0 + h * 0.32, w * 0.76, h * 0.5, 3);
  c.fill();
  c.fillStyle = heat > 0 ? `rgba(255,${Math.round(140 - heat * 60)},40,${0.3 + heat * 0.5})` : '#2a2f35';
  c.fillRect(b.x0 + w * 0.18, b.y0 + h * 0.38, w * 0.64, h * 0.38);
  for (let i = 0; i < 3; i++) {
    c.fillStyle = '#d0d4d8';
    c.beginPath();
    c.arc(b.x0 + w * (0.25 + i * 0.25), b.y0 + h * 0.15, Math.max(2, w * 0.05), 0, TAU);
    c.fill();
  }
  // The burner on top, glowing when it's on.
  c.fillStyle = heat > 0 ? `rgba(255,${Math.round(110 - heat * 70)},30,${0.5 + heat * 0.5})` : '#555b62';
  c.fillRect(b.x0 + w * 0.15, b.y0 - 3, w * 0.7, 3);
}

/** The scientist at the window. mask: wearing a gas mask. gone: evacuated. */
export function drawScientist(c: Ctx, w: Box, mask: boolean, gone: boolean, t: number): { x: number; y: number } {
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
    c.restore();
    return { x: cx, y: w.y0 };
  }
  const s = Math.min(ww, hh) * 0.32;
  const bob = Math.sin(t * 0.002) * 1.5;
  const hy = w.y0 + hh * 0.48 + bob;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // Lab coat.
  c.fillStyle = '#f2f4f6';
  c.beginPath();
  c.ellipse(cx, w.y1 + s * 0.3, s * 1.6, s * 1.2, 0, 0, TAU);
  c.fill();
  c.stroke();
  // Head and hair.
  c.fillStyle = '#e8b08a';
  c.beginPath();
  c.arc(cx, hy, s, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#4a3324';
  c.beginPath();
  c.arc(cx, hy - s * 0.2, s * 1.02, Math.PI * 1.05, Math.PI * 1.95);
  c.fill();
  if (mask) {
    c.fillStyle = '#3d4a3a';
    c.beginPath();
    c.ellipse(cx, hy + s * 0.35, s * 0.75, s * 0.55, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#2a3329';
    c.beginPath();
    c.arc(cx, hy + s * 0.75, s * 0.28, 0, TAU);
    c.fill();
    c.stroke();
  }
  // Goggles.
  c.fillStyle = 'rgba(160,220,255,0.8)';
  for (const dx of [-0.42, 0.42]) {
    c.beginPath();
    c.arc(cx + dx * s, hy - s * 0.05, s * 0.32, 0, TAU);
    c.fill();
    c.stroke();
  }
  c.restore();
  return { x: cx, y: w.y0 };
}

/** The front glass and the cell's frame, drawn over everything. */
export function drawGlass(c: Ctx, m: Room): void {
  const { L, R, T, B, W, H } = m;
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.beginPath();
  c.moveTo(L + (R - L) * 0.06, T);
  c.lineTo(L + (R - L) * 0.14, T);
  c.lineTo(L + (R - L) * 0.03, B);
  c.lineTo(L, B);
  c.lineTo(L, T + (B - T) * 0.6);
  c.closePath();
  c.fill();
  // Frame.
  c.fillStyle = '#39414d';
  c.fillRect(0, 0, W, T);
  c.fillRect(0, B, W, H - B);
  c.fillRect(0, 0, L, H);
  c.fillRect(R, 0, W - R, H);
  c.strokeStyle = 'rgba(210,235,255,0.35)';
  c.lineWidth = 1.5;
  c.strokeRect(L, T, R - L, B - T);
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
  c.restore();
  // The sign.
  c.fillStyle = '#c9d2db';
  c.font = `700 ${Math.max(8, Math.round(T * 0.34))}px Rubik, system-ui, sans-serif`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText('UNIT 7 · SUBJECT: HAMMY', L + 4, T / 2);
}

/** A robot vacuum, side on, heading in `dir`, with its little light blinking. */
export function drawVacuum(c: Ctx, x: number, y: number, s: number, t: number, dir = 1): void {
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // Body: a thick puck with a bumper.
  c.fillStyle = '#e9edf2';
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
  c.fillStyle = Math.sin(t * 0.01) > 0 ? '#5ee0b0' : '#1f6f55';
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
}

/** Where a steak sits in the pan on the stove `b`. */
export const panSpot = (b: Box): { x: number; y: number } => ({ x: (b.x0 + b.x1) / 2, y: b.y0 - 8 });

/** The frying pan on the burner. */
export function drawPan(c: Ctx, b: Box): { x: number; y: number } {
  const cx = (b.x0 + b.x1) / 2;
  const w = b.x1 - b.x0;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.fillStyle = '#2a2d31';
  c.beginPath();
  c.ellipse(cx, b.y0 - 5, w * 0.36, 4, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.fillRect(cx + w * 0.34, b.y0 - 7, w * 0.3, 3);
  return panSpot(b);
}
