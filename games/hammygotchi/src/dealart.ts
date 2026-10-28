// Hammy's Pizza Boxes, drawn: a greasy pizza box seen from above, shut or
// open. Every box has its own stains (seeded by its number, so a box looks the
// same every time you look), and an open one shows the prize on a plate.
import { DISPLAY_FONT, UI_FONT } from './arcadeview';

/** A small repeatable random source, for a box's stains. */
function stains(seed: number): () => number {
  let a = (seed * 0x9e3779b1 + 0x7f4a7c15) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

export interface BoxLook {
  /** Which box, 1-based: the number on its sticker and the seed for its stains. */
  n: number;
  /** Shut (a number), or open (a prize on a plate). */
  prize: string | null;
  /** An open box's prize: bad for you to see (at or over the average) or good. */
  hot?: boolean;
  /** The one you're keeping. */
  mine?: boolean;
  /** Face up at the end, but not one you opened: dimmed. */
  dim?: boolean;
}

/** Draw one box filling a W×H canvas (already scaled to CSS pixels). */
export function drawBox(c: CanvasRenderingContext2D, W: number, H: number, look: BoxLook): void {
  c.clearRect(0, 0, W, H);
  const r = stains(look.n);
  const pad = Math.max(1.5, W * 0.04);
  const x = pad;
  const y = pad;
  const w = W - pad * 2;
  const h = H - pad * 2;
  const rad = Math.max(3, w * 0.08);
  c.save();
  if (look.dim) c.globalAlpha = 0.5;

  if (look.prize === null) shut(c, x, y, w, h, rad, look, r);
  else open(c, x, y, w, h, rad, look, r);

  if (look.mine) {
    // A gold frame and a star: this is the one you're keeping.
    c.globalAlpha = 1;
    c.lineWidth = Math.max(2, W * 0.07);
    c.strokeStyle = '#ffd34d';
    c.shadowColor = 'rgba(255, 211, 77, 0.8)';
    c.shadowBlur = W * 0.12;
    c.beginPath();
    c.roundRect(x - pad * 0.3, y - pad * 0.3, w + pad * 0.6, h + pad * 0.6, rad + 1);
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = '#ffd34d';
    c.strokeStyle = '#4a2c00';
    c.lineWidth = 1.5;
    star(c, x + w * 0.16, y + h * 0.16, Math.max(5, W * 0.15));
  }
  c.restore();
}

function star(c: CanvasRenderingContext2D, cx: number, cy: number, rad: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? rad * 0.45 : rad;
    c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  c.closePath();
  c.stroke();
  c.fill();
}

/** Grease on cardboard: soft brown blotches, some darker where it has soaked in. */
function grease(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number, count: number): void {
  for (let i = 0; i < count; i++) {
    const cx = x + w * (0.1 + r() * 0.8);
    const cy = y + h * (0.1 + r() * 0.8);
    const rad = w * (0.1 + r() * 0.22);
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const dark = r() < 0.4;
    g.addColorStop(0, dark ? 'rgba(98, 54, 14, 0.5)' : 'rgba(140, 84, 24, 0.38)');
    g.addColorStop(0.65, dark ? 'rgba(98, 54, 14, 0.18)' : 'rgba(140, 84, 24, 0.12)');
    g.addColorStop(1, 'rgba(140, 84, 24, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, cy, rad, rad * (0.7 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
}

function shut(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number, look: BoxLook, r: () => number): void {
  // Cardboard, a little different for every box.
  const tint = (r() - 0.5) * 18;
  const g = c.createLinearGradient(x, y, x + w * 0.3, y + h);
  g.addColorStop(0, `rgb(${236 + tint}, ${204 + tint}, ${150 + tint})`);
  g.addColorStop(1, `rgb(${208 + tint}, ${165 + tint}, ${104 + tint})`);
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(x, y, w, h, rad);
  c.fill();
  c.save();
  c.clip();
  grease(c, x, y, w, h, r, 3 + Math.floor(r() * 3));
  // A smear of sauce on some of them.
  if (r() < 0.45) {
    const sx = x + w * (0.15 + r() * 0.7);
    const sy = y + h * (0.55 + r() * 0.35);
    c.fillStyle = 'rgba(180, 40, 24, 0.55)';
    c.beginPath();
    c.ellipse(sx, sy, w * 0.07, w * 0.045, r() * 3, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(sx + w * 0.08, sy + w * 0.03, w * 0.025, w * 0.02, 0, 0, Math.PI * 2);
    c.fill();
  }
  // The lid's fold and the front edge.
  c.strokeStyle = 'rgba(110, 66, 24, 0.5)';
  c.lineWidth = Math.max(1, w * 0.025);
  c.beginPath();
  c.moveTo(x, y + h * 0.2);
  c.lineTo(x + w, y + h * 0.2);
  c.stroke();
  c.strokeStyle = 'rgba(255, 245, 220, 0.35)';
  c.beginPath();
  c.moveTo(x, y + h * 0.2 + c.lineWidth);
  c.lineTo(x + w, y + h * 0.2 + c.lineWidth);
  c.stroke();
  // The tab that tucks in.
  c.fillStyle = 'rgba(110, 66, 24, 0.35)';
  c.beginPath();
  c.arc(x + w / 2, y + h * 0.2, w * 0.08, 0, Math.PI);
  c.fill();
  c.restore();
  c.strokeStyle = '#7a4b1c';
  c.lineWidth = Math.max(1.2, w * 0.035);
  c.beginPath();
  c.roundRect(x, y, w, h, rad);
  c.stroke();

  // The number, on a sticker so it reads over any stain.
  const cx = x + w / 2;
  const cy = y + h * 0.6;
  const sr = w * 0.3;
  c.fillStyle = '#fff8e6';
  c.strokeStyle = '#5a3412';
  c.lineWidth = Math.max(1, w * 0.03);
  c.beginPath();
  c.arc(cx, cy, sr, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#2b1400';
  c.font = `${Math.round(sr * (look.n >= 10 ? 1.05 : 1.25))}px ${DISPLAY_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(look.n), cx, cy + sr * 0.06);
}

function open(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number, look: BoxLook, r: () => number): void {
  // The lid, flipped up behind the box.
  const lid = h * 0.2;
  c.fillStyle = '#c99a5b';
  c.strokeStyle = '#7a4b1c';
  c.lineWidth = Math.max(1.2, w * 0.035);
  c.beginPath();
  c.roundRect(x + w * 0.04, y, w * 0.92, lid + 2, [rad, rad, 0, 0]);
  c.fill();
  c.stroke();
  // Inside: dark, with the grease that came off the pizza.
  const iy = y + lid;
  const ih = h - lid;
  c.fillStyle = '#3a2412';
  c.beginPath();
  c.roundRect(x, iy, w, ih, [0, 0, rad, rad]);
  c.fill();
  c.save();
  c.clip();
  grease(c, x, iy, w, ih, r, 3);
  c.restore();
  c.strokeStyle = '#7a4b1c';
  c.beginPath();
  c.roundRect(x, iy, w, ih, [0, 0, rad, rad]);
  c.stroke();
  c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  c.lineWidth = Math.max(1, w * 0.04);
  c.beginPath();
  c.roundRect(x + w * 0.07, iy + ih * 0.08, w * 0.86, ih * 0.84, rad * 0.6);
  c.stroke();

  // The prize, on a plate.
  const text = look.prize ?? '';
  const pw = w * 0.84;
  const ph = Math.min(ih * 0.6, w * 0.42);
  const px = x + (w - pw) / 2;
  const py = iy + (ih - ph) / 2;
  c.fillStyle = look.hot ? '#ff6a4d' : '#3fd0a0';
  c.strokeStyle = look.hot ? '#7a1d10' : '#0e5a43';
  c.lineWidth = Math.max(1, w * 0.03);
  c.beginPath();
  c.roundRect(px, py, pw, ph, ph * 0.3);
  c.fill();
  c.stroke();
  let size = ph * 0.62;
  c.font = `800 ${size}px ${UI_FONT}`;
  const fit = (pw * 0.9) / Math.max(1, c.measureText(text).width);
  if (fit < 1) {
    size *= fit;
    c.font = `800 ${size}px ${UI_FONT}`;
  }
  c.fillStyle = look.hot ? '#fff6ee' : '#06281d';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, px + pw / 2, py + ph / 2 + 0.5);
}
