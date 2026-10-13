// Procedural drawings of everything that lives in the jar. Each function
// draws one organism with its base at (x, y), scaled by `s` (1 ≈ a jar
// 260px wide). Shared by the jar scene and the list icons.
import type { Palette } from './palette';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Deterministic 0..1 noise from a number. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function halo(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function bonnet(
  ctx: Ctx,
  x: number,
  y: number,
  h: number,
  lean: number,
  pal: Palette,
  glow: number,
  colors?: { cap: string; capDark: string; capRim: string },
): void {
  const c = colors ?? pal;
  const tx = x + lean;
  const ty = y - h;
  const w = h * 0.6;
  const ch = h * 0.42;
  if (glow > 0) halo(ctx, tx, ty - ch * 0.35, w * 1.5, pal.glow, glow * 0.55);

  ctx.strokeStyle = pal.stem;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, h * 0.085);
  ctx.beginPath();
  ctx.moveTo(x, y + 1);
  ctx.quadraticCurveTo(x + lean * 0.1, y - h * 0.55, tx, ty);
  ctx.stroke();

  const grad = ctx.createLinearGradient(tx, ty - ch, tx, ty + ch * 0.1);
  grad.addColorStop(0, c.capDark);
  grad.addColorStop(1, c.cap);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(tx - w / 2, ty + ch * 0.1);
  ctx.bezierCurveTo(tx - w * 0.52, ty - ch * 0.55, tx - w * 0.2, ty - ch, tx, ty - ch);
  ctx.bezierCurveTo(tx + w * 0.2, ty - ch, tx + w * 0.52, ty - ch * 0.55, tx + w / 2, ty + ch * 0.1);
  ctx.quadraticCurveTo(tx, ty - ch * 0.16, tx - w / 2, ty + ch * 0.1);
  ctx.fill();

  // Striations and rim.
  ctx.strokeStyle = c.capRim;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(0.5, h * 0.025);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(tx + i * w * 0.03, ty - ch * 0.85);
    ctx.lineTo(tx + i * w * 0.17, ty - ch * 0.02);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(tx - w / 2, ty + ch * 0.1);
  ctx.quadraticCurveTo(tx, ty - ch * 0.16, tx + w / 2, ty + ch * 0.1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function moss(ctx: Ctx, x: number, y: number, w: number, pal: Palette, seed: number): void {
  const n = Math.max(5, Math.round(w / 3.5));
  const layers = [
    { color: pal.moss[0], lift: 0.45, size: 1 },
    { color: pal.moss[1], lift: 0.75, size: 0.8 },
    { color: pal.moss[2], lift: 1.0, size: 0.35 },
  ];
  layers.forEach((layer, li) => {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const dome = Math.sin(Math.PI * f) * w * 0.2;
      const r = Math.max(0.6, w * 0.11 * layer.size * (0.7 + hash(seed + i * 3.1 + li * 17) * 0.6));
      const px = x - w / 2 + f * w + (hash(seed + i * 7.7 + li) - 0.5) * 3;
      const py = y - dome * layer.lift + (li === 2 ? r : 0);
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, TAU);
    }
    ctx.fill();
  });
}

/** A clump of fronds. `t` is ms for sway. */
export function fern(ctx: Ctx, x: number, y: number, h: number, pal: Palette, t: number, phase: number): void {
  const fronds = [
    { a: -1.05, l: 0.78, c: pal.fern[0] },
    { a: 0.95, l: 0.82, c: pal.fern[0] },
    { a: -0.45, l: 1, c: pal.fern[1] },
    { a: 0.4, l: 0.95, c: pal.fern[1] },
    { a: 0.02, l: 0.9, c: pal.fern[1] },
  ];
  for (const f of fronds) {
    const sway = Math.sin(t * 0.0009 + phase + f.a * 2) * 0.05;
    const a = f.a + sway;
    const len = h * f.l;
    const tipX = x + Math.sin(a) * len * 0.9;
    const tipY = y - Math.cos(a) * len * 0.75;
    const cx = x + Math.sin(a) * len * 0.3;
    const cy = y - len * 0.95;
    const at = (s: number) => {
      const u = 1 - s;
      return {
        x: u * u * x + 2 * u * s * cx + s * s * tipX,
        y: u * u * y + 2 * u * s * cy + s * s * tipY,
        dx: 2 * u * (cx - x) + 2 * s * (tipX - cx),
        dy: 2 * u * (cy - y) + 2 * s * (tipY - cy),
      };
    };
    ctx.strokeStyle = f.c;
    ctx.lineWidth = Math.max(0.8, h * 0.022);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cx, cy, tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = f.c;
    ctx.beginPath();
    const N = 15;
    for (let i = 2; i <= N; i++) {
      const s = i / N;
      const p = at(s);
      const d = Math.hypot(p.dx, p.dy) || 1;
      const ux = p.dx / d;
      const uy = p.dy / d;
      const leaf = h * 0.12 * (1 - s * 0.72);
      for (const side of [-1, 1]) {
        const nx = -uy * side;
        const ny = ux * side;
        const ex = p.x + nx * leaf * 0.55 + ux * leaf * 0.2;
        const ey = p.y + ny * leaf * 0.55 + uy * leaf * 0.2;
        const rot = Math.atan2(ny + uy * 0.35, nx + ux * 0.35);
        const rx = leaf * 0.55;
        ctx.moveTo(ex + Math.cos(rot) * rx, ey + Math.sin(rot) * rx);
        ctx.ellipse(ex, ey, rx, Math.max(0.6, leaf * 0.2), rot, 0, TAU);
      }
    }
    ctx.fill();
  }
}

export function springtail(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.fillStyle = '#d2c9df';
  ctx.beginPath();
  ctx.ellipse(x, y - 1.2 * s, 2.3 * s, 1.1 * s, -0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(210,201,223,0.75)';
  ctx.lineWidth = 0.5 * s;
  ctx.beginPath();
  ctx.moveTo(x + 2 * s, y - 1.8 * s);
  ctx.lineTo(x + 3.4 * s, y - 3.2 * s);
  ctx.moveTo(x + 1.6 * s, y - 1.9 * s);
  ctx.lineTo(x + 2.4 * s, y - 3.6 * s);
  ctx.stroke();
}

export function pillbug(ctx: Ctx, x: number, y: number, s: number, dir: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.strokeStyle = '#2e3036';
  ctx.lineWidth = 0.7 * s;
  for (let i = 0; i < 6; i++) {
    const lx = -4.5 * s + i * 1.9 * s;
    const k = Math.sin(t * 0.025 + i * 1.3) * 0.7 * s;
    ctx.beginPath();
    ctx.moveTo(lx, -0.6 * s);
    ctx.lineTo(lx + k, 0.5 * s);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, -5 * s, 0, 0);
  g.addColorStop(0, '#9196a1');
  g.addColorStop(1, '#4f535c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -0.6 * s, 6.2 * s, 3.8 * s, 0, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,30,36,0.55)';
  ctx.lineWidth = 0.6 * s;
  for (let i = 1; i < 7; i++) {
    const sx = -6.2 * s + i * 1.75 * s;
    const top = 3.8 * s * Math.sqrt(Math.max(0, 1 - (sx / (6.2 * s)) ** 2));
    ctx.beginPath();
    ctx.moveTo(sx, -0.6 * s);
    ctx.lineTo(sx + 0.4 * s, -0.6 * s - top);
    ctx.stroke();
  }
  ctx.fillStyle = '#464a52';
  ctx.beginPath();
  ctx.ellipse(5.8 * s, -1.2 * s, 1.4 * s, 1.2 * s, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#5a5e67';
  ctx.beginPath();
  ctx.moveTo(6.6 * s, -1.8 * s);
  ctx.quadraticCurveTo(8.2 * s, -3 * s, 9 * s, -2 * s);
  ctx.stroke();
  ctx.restore();
}

export function snail(ctx: Ctx, x: number, y: number, s: number, dir: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  // Foot and head.
  ctx.fillStyle = '#bcae94';
  ctx.beginPath();
  ctx.ellipse(1 * s, -1.4 * s, 8.5 * s, 1.7 * s, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7.6 * s, -2.8 * s, 2.2 * s, 2 * s, -0.3, 0, TAU);
  ctx.fill();
  const wave = Math.sin(t * 0.002) * 0.6 * s;
  ctx.strokeStyle = '#bcae94';
  ctx.lineWidth = 0.9 * s;
  ctx.beginPath();
  ctx.moveTo(8.2 * s, -4 * s);
  ctx.lineTo(10 * s + wave, -7.4 * s);
  ctx.moveTo(7.2 * s, -4.2 * s);
  ctx.lineTo(8 * s - wave, -7.8 * s);
  ctx.stroke();
  ctx.fillStyle = '#2a241c';
  ctx.beginPath();
  ctx.arc(10 * s + wave, -7.4 * s, 0.7 * s, 0, TAU);
  ctx.arc(8 * s - wave, -7.8 * s, 0.7 * s, 0, TAU);
  ctx.fill();
  // Shell with a spiral.
  const sx = -0.5 * s;
  const sy = -6 * s;
  const r = 5 * s;
  const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r);
  g.addColorStop(0, '#d8a865');
  g.addColorStop(1, '#7a4c28');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,34,16,0.7)';
  ctx.lineWidth = 0.8 * s;
  ctx.beginPath();
  for (let a = 0; a < TAU * 2.6; a += 0.2) {
    const rr = r * (1 - a / (TAU * 2.9));
    const px = sx + Math.cos(a) * rr * 0.9;
    const py = sy + Math.sin(a) * rr * 0.9;
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

export function frog(ctx: Ctx, x: number, y: number, s: number, dir: number, t: number, phase: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  const blue = '#3d7fd8';
  const deep = '#22508f';
  const ink = '#0e121c';
  // Back leg, folded.
  ctx.fillStyle = deep;
  ctx.beginPath();
  ctx.ellipse(-4.2 * s, -2.4 * s, 4.2 * s, 2.4 * s, -0.2, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-2.4 * s, -0.4 * s, 3.6 * s, 0.9 * s, 0, 0, TAU);
  ctx.fill();
  // Body.
  const g = ctx.createLinearGradient(0, -10 * s, 0, 0);
  g.addColorStop(0, '#5b9bf0');
  g.addColorStop(1, blue);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -4.6 * s, 6.4 * s, 4.2 * s, -0.35, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(5 * s, -6.4 * s, 3.4 * s, 2.9 * s, 0.1, 0, TAU);
  ctx.fill();
  // Throat pulse.
  const breathe = 1 + Math.sin(t * 0.007 + phase) * 0.12;
  ctx.fillStyle = '#6aa6f2';
  ctx.beginPath();
  ctx.ellipse(6 * s, -4.4 * s, 1.9 * s * breathe, 1.3 * s * breathe, 0, 0, TAU);
  ctx.fill();
  // Spots.
  ctx.fillStyle = ink;
  for (const [px, py, r] of [
    [-2, -6.4, 1.1],
    [0.8, -7.6, 0.8],
    [-3.6, -3.6, 0.7],
    [1.4, -4.2, 0.9],
    [3.6, -8.1, 0.6],
  ]) {
    ctx.beginPath();
    ctx.arc(px * s, py * s, r * s, 0, TAU);
    ctx.fill();
  }
  // Front leg.
  ctx.strokeStyle = deep;
  ctx.lineWidth = 1.5 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(4 * s, -3.4 * s);
  ctx.lineTo(5.6 * s, -0.4 * s);
  ctx.stroke();
  ctx.fillStyle = deep;
  ctx.beginPath();
  ctx.arc(6.2 * s, -0.4 * s, 0.9 * s, 0, TAU);
  ctx.fill();
  // Eye, with an occasional blink.
  const blink = Math.sin(t * 0.0011 + phase * 3) > 0.985;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(6 * s, -8.1 * s, 1.6 * s, 0, TAU);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = blue;
    ctx.beginPath();
    ctx.ellipse(6 * s, -8.1 * s, 1.8 * s, 1.7 * s, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(6.5 * s, -8.7 * s, 0.45 * s, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Specimens

export function glowcapCluster(ctx: Ctx, x: number, y: number, s: number, pal: Palette, t: number): void {
  const colors = { cap: '#c9f5a3', capDark: '#6fb35a', capRim: '#efffd9' };
  const pulse = 0.75 + Math.sin(t * 0.002) * 0.25;
  const caps = [
    [-5, 9, -1.5],
    [0, 13, 0.5],
    [5, 8, 2],
    [2.5, 5.5, 1],
  ];
  for (const [dx, h, lean] of caps) bonnet(ctx, x + dx * s, y, h * s, lean * s, pal, pulse, colors);
}

export function sundew(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const a = -Math.PI / 2 + (i - (leaves - 1) / 2) * 0.32 + Math.sin(t * 0.0007 + i) * 0.03;
    const len = (9 + (i % 3) * 2) * s;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    ctx.strokeStyle = '#8f3a2c';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#c84a35';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 1.9 * s, 1.4 * s, a, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,230,0.85)';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a + k - 1) * 2 * s, ey + Math.sin(a + k - 1) * 2 * s, 0.45 * s, 0, TAU);
      ctx.fill();
    }
  }
}

export function pixieCups(ctx: Ctx, x: number, y: number, s: number): void {
  const cups = [
    [-6, 7],
    [-2, 10],
    [2.5, 8],
    [6, 6],
    [0.5, 5],
  ];
  for (const [dx, h] of cups) {
    const cx = x + dx * s;
    const top = y - h * s;
    ctx.strokeStyle = '#9fb39b';
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, top + 2 * s);
    ctx.stroke();
    ctx.fillStyle = '#a9bea4';
    ctx.beginPath();
    ctx.moveTo(cx - 0.6 * s, top + 2.5 * s);
    ctx.lineTo(cx - 2.4 * s, top);
    ctx.lineTo(cx + 2.4 * s, top);
    ctx.lineTo(cx + 0.6 * s, top + 2.5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6f826c';
    ctx.beginPath();
    ctx.ellipse(cx, top, 2.4 * s, 0.7 * s, 0, 0, TAU);
    ctx.fill();
  }
}

export function coral(ctx: Ctx, x: number, y: number, s: number, seed: number): void {
  ctx.lineCap = 'round';
  const branch = (bx: number, by: number, a: number, len: number, w: number, depth: number, k: number) => {
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len;
    ctx.strokeStyle = depth > 2 ? '#f2b06a' : '#e08848';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (depth >= 4) return;
    const spread = 0.35 + hash(seed + k) * 0.3;
    branch(ex, ey, a - spread, len * 0.72, w * 0.7, depth + 1, k * 2 + 1);
    branch(ex, ey, a + spread, len * 0.72, w * 0.7, depth + 1, k * 2 + 2);
  };
  branch(x, y, -Math.PI / 2 - 0.25, 5 * s, 2.2 * s, 0, 1);
  branch(x + 3 * s, y, -Math.PI / 2 + 0.3, 4.4 * s, 2 * s, 0, 7);
}

export function ghostPipe(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  halo(ctx, x, y - 12 * s, 16 * s, 'rgba(240,236,250,0.5)', 0.35);
  const stems = [
    [-4, 15, -1],
    [0, 19, 1],
    [4, 13, 1],
  ];
  for (const [dx, h, d] of stems) {
    const bx = x + dx * s;
    const nod = Math.sin(t * 0.0006 + dx) * 0.6 * s;
    const tx = bx + d * 3 * s + nod;
    const ty = y - h * s;
    ctx.strokeStyle = '#ece8f2';
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx, ty - 2 * s, tx, ty + 1 * s);
    ctx.stroke();
    ctx.fillStyle = '#f4f1f8';
    ctx.beginPath();
    ctx.ellipse(tx + d * 0.6 * s, ty + 2.6 * s, 1.8 * s, 3 * s, d * 0.5, 0, TAU);
    ctx.fill();
  }
}

export function beetle(ctx: Ctx, x: number, y: number, s: number, dir: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.strokeStyle = '#4a3a12';
  ctx.lineWidth = 0.7 * s;
  for (let i = 0; i < 3; i++) {
    const lx = -2.5 * s + i * 2.6 * s;
    const k = Math.sin(t * 0.004 + i) * 0.3 * s;
    ctx.beginPath();
    ctx.moveTo(lx, -1.2 * s);
    ctx.lineTo(lx - 1 * s + k, 0.4 * s);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, -6 * s, 0, 0);
  g.addColorStop(0, '#f6d873');
  g.addColorStop(0.55, '#c99a2e');
  g.addColorStop(1, '#6e5214');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-0.5 * s, -2.6 * s, 4.8 * s, 2.6 * s, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(4.4 * s, -2.4 * s, 1.8 * s, 1.6 * s, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8a6a1e';
  ctx.lineWidth = 0.9 * s;
  ctx.beginPath();
  ctx.moveTo(5.6 * s, -3 * s);
  ctx.quadraticCurveTo(8.4 * s, -5 * s, 8 * s, -2.4 * s);
  ctx.moveTo(5.6 * s, -2 * s);
  ctx.quadraticCurveTo(8.6 * s, -1 * s, 7.6 * s, -3.4 * s);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,250,220,0.7)';
  ctx.beginPath();
  ctx.ellipse(-1.8 * s, -4 * s, 1.6 * s, 0.6 * s, -0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** The golden bloom that appears for a few seconds. `life` runs 0..1. */
export function bloom(ctx: Ctx, x: number, y: number, s: number, t: number, life: number): void {
  const appear = Math.min(1, life * 8);
  const fade = life > 0.8 ? 1 - (life - 0.8) / 0.2 : 1;
  const k = appear * fade;
  const pulse = 1 + Math.sin(t * 0.008) * 0.12;
  halo(ctx, x, y - 9 * s, 26 * s * pulse, 'rgba(255,214,120,0.9)', 0.55 * k);
  ctx.globalAlpha = k;
  ctx.strokeStyle = '#f8ecd2';
  ctx.lineWidth = 2.4 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 7 * s * appear);
  ctx.stroke();
  const g = ctx.createRadialGradient(x - 3 * s, y - 13 * s, 1, x, y - 10 * s, 9 * s);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(0.5, '#f4c14f');
  g.addColorStop(1, '#b97a1c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y - 10 * s * appear, 8.5 * s * appear, 6.5 * s * appear, 0, Math.PI, TAU);
  ctx.quadraticCurveTo(x, y - 7 * s * appear, x - 8.5 * s * appear, y - 10 * s * appear);
  ctx.fill();
  // Sparkles.
  ctx.fillStyle = '#fff6d8';
  for (let i = 0; i < 4; i++) {
    const a = t * 0.002 + (i * TAU) / 4;
    const r = 15 * s;
    const sz = (1 + Math.sin(t * 0.01 + i * 2)) * 0.9 * s;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y - 10 * s + Math.sin(a) * r * 0.6, sz, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A small network of threads, for the hyphae icon. */
export function threads(ctx: Ctx, x: number, y: number, s: number, pal: Palette): void {
  ctx.strokeStyle = pal.myc;
  ctx.lineCap = 'round';
  const grow = (bx: number, by: number, a: number, len: number, depth: number, k: number) => {
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len;
    ctx.lineWidth = Math.max(0.6, (1.6 - depth * 0.3) * s);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (depth >= 3) return;
    grow(ex, ey, a - 0.5 - hash(k) * 0.4, len * 0.75, depth + 1, k * 2 + 1);
    grow(ex, ey, a + 0.4 + hash(k + 9) * 0.4, len * 0.75, depth + 1, k * 2 + 2);
  };
  grow(x, y, Math.PI / 2 + 0.6, 6 * s, 0, 1);
  grow(x, y, Math.PI / 2 - 0.6, 6 * s, 0, 5);
  ctx.fillStyle = pal.pulse;
  ctx.beginPath();
  ctx.arc(x, y, 1.6 * s, 0, TAU);
  ctx.fill();
}
