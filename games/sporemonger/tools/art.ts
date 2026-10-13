// Renders the app icon, launch screen and Play feature graphic in the
// banner's night-market look. Served by Vite (npm run dev:sporemonger),
// opened by scripts/make-art.mjs:
//   /tools/art.html?kind=icon     1024×1024, opaque
//   /tools/art.html?kind=splash   2732×2732, emblem and wordmark in the middle
//   /tools/art.html?kind=feature  1024×500, Google Play feature graphic
import '@fontsource/gluten/latin-700.css';
import '@fontsource/figtree/latin-600.css';
import { mulberry32 } from '@shared/rng';

const kind = new URLSearchParams(location.search).get('kind') ?? 'icon';
const BG = '#0d1120';
const TEXT = '#ece8f6';
const LANTERN = '#f6b95c';
const MUTED = '#a3a6c4';
const TAU = Math.PI * 2;

type Ctx = CanvasRenderingContext2D;

/** Night sky with swamp haze, filling a w×h area. */
function sky(c: Ctx, w: number, h: number, hazeTop: number, hazeBottom: number): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b0f1e');
  g.addColorStop(0.55, '#141c36');
  g.addColorStop(1, '#1d3442');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const haze = c.createLinearGradient(0, hazeTop, 0, hazeBottom);
  haze.addColorStop(0, 'rgba(90,200,190,0)');
  haze.addColorStop(1, 'rgba(90,200,190,0.18)');
  c.fillStyle = haze;
  c.fillRect(0, hazeTop, w, hazeBottom - hazeTop);
}

/** A dark mushroom on the horizon. */
function farShroom(c: Ctx, x: number, ground: number, h: number, w: number): void {
  const top = ground - h;
  c.fillStyle = '#16233a';
  c.beginPath();
  c.moveTo(x - w * 0.07, ground);
  c.quadraticCurveTo(x - w * 0.05, ground - h * 0.5, x - w * 0.05, top);
  c.lineTo(x + w * 0.05, top);
  c.quadraticCurveTo(x + w * 0.05, ground - h * 0.5, x + w * 0.08, ground);
  c.fill();
  const glow = c.createRadialGradient(x, top + 4, 2, x, top + 4, w * 0.6);
  glow.addColorStop(0, 'rgba(110,230,205,0.24)');
  glow.addColorStop(1, 'rgba(110,230,205,0)');
  c.fillStyle = glow;
  c.beginPath();
  c.ellipse(x, top + 6, w * 0.6, w * 0.22, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#1c2a48';
  c.beginPath();
  c.ellipse(x, top, w / 2, w * 0.2, 0, Math.PI, TAU);
  c.quadraticCurveTo(x, top + w * 0.07, x - w / 2, top);
  c.fill();
}

/** The stall's striped awning, scalloped along its bottom edge. */
function awning(c: Ctx, x0: number, x1: number, top: number, depth: number, stripes: number): void {
  const sw = (x1 - x0) / stripes;
  for (let i = 0; i < stripes; i++) {
    const a = x0 + i * sw;
    c.fillStyle = i % 2 ? '#3a2a5c' : '#c9894a';
    c.beginPath();
    c.moveTo(a, top);
    c.lineTo(a + sw, top);
    c.lineTo(a + sw, top + depth * 0.7);
    c.quadraticCurveTo(a + sw / 2, top + depth * 1.25, a, top + depth * 0.7);
    c.closePath();
    c.fill();
  }
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillRect(x0, top, x1 - x0, depth * 0.06);
}

/**
 * The emblem: one big glowing mushroom with a lantern hanging from its cap,
 * in a square of side s centred on (cx, cy). Transparent outside the art.
 */
function emblem(c: Ctx, cx: number, cy: number, s: number, seed = 11): void {
  const rnd = mulberry32(seed);
  const rimY = cy - 0.06 * s;
  const capTop = cy - 0.42 * s;
  const capW = 0.4 * s;
  const groundY = cy + 0.5 * s;

  // Gill light spilling down the stalk and around.
  const spill = c.createRadialGradient(cx, rimY + 0.04 * s, 0, cx, rimY + 0.04 * s, 0.55 * s);
  spill.addColorStop(0, 'rgba(124,239,210,0.30)');
  spill.addColorStop(1, 'rgba(124,239,210,0)');
  c.fillStyle = spill;
  c.fillRect(cx - 0.6 * s, rimY - 0.5 * s, 1.2 * s, 1.1 * s);

  // Stalk, lit from the gills above.
  const stalk = c.createLinearGradient(0, rimY, 0, groundY);
  stalk.addColorStop(0, '#4f8d8c');
  stalk.addColorStop(0.35, '#2a4a5c');
  stalk.addColorStop(1, '#141d33');
  c.fillStyle = stalk;
  c.beginPath();
  c.moveTo(cx - 0.085 * s, groundY);
  c.bezierCurveTo(cx - 0.06 * s, cy + 0.25 * s, cx - 0.075 * s, cy + 0.05 * s, cx - 0.055 * s, rimY);
  c.lineTo(cx + 0.055 * s, rimY);
  c.bezierCurveTo(cx + 0.075 * s, cy + 0.05 * s, cx + 0.06 * s, cy + 0.25 * s, cx + 0.095 * s, groundY);
  c.closePath();
  c.fill();

  // Glowing gills: a bright band just under the rim.
  const gill = c.createRadialGradient(cx, rimY, 0, cx, rimY, capW);
  gill.addColorStop(0, 'rgba(160,255,228,0.95)');
  gill.addColorStop(0.55, 'rgba(124,239,210,0.55)');
  gill.addColorStop(1, 'rgba(124,239,210,0)');
  c.fillStyle = gill;
  c.beginPath();
  c.ellipse(cx, rimY + 0.012 * s, capW * 0.98, 0.07 * s, 0, 0, TAU);
  c.fill();

  // Cap.
  const capPath = () => {
    c.beginPath();
    c.moveTo(cx - capW, rimY);
    c.bezierCurveTo(cx - capW * 0.98, capTop - 0.02 * s, cx + capW * 0.98, capTop - 0.02 * s, cx + capW, rimY);
    c.quadraticCurveTo(cx, rimY + 0.06 * s, cx - capW, rimY);
    c.closePath();
  };
  const cap = c.createLinearGradient(0, capTop, 0, rimY);
  cap.addColorStop(0, '#433f8e');
  cap.addColorStop(0.6, '#2b2c66');
  cap.addColorStop(1, '#1c1f4a');
  c.fillStyle = cap;
  capPath();
  c.fill();
  // Moonlight on the crown.
  c.save();
  capPath();
  c.clip();
  const sheen = c.createRadialGradient(cx - capW * 0.3, capTop + 0.06 * s, 0, cx - capW * 0.3, capTop + 0.06 * s, capW * 0.8);
  sheen.addColorStop(0, 'rgba(200,190,255,0.22)');
  sheen.addColorStop(1, 'rgba(200,190,255,0)');
  c.fillStyle = sheen;
  c.fillRect(cx - capW, capTop - 0.05 * s, capW * 2, rimY - capTop + 0.1 * s);
  // Glowing spots.
  const spots = [
    [-0.52, 0.42, 0.075],
    [-0.12, 0.72, 0.09],
    [0.34, 0.5, 0.07],
    [0.68, 0.2, 0.05],
    [-0.8, 0.12, 0.045],
    [0.08, 0.3, 0.05],
  ];
  for (const [ax, ay, r] of spots) {
    const x = cx + ax * capW;
    const y = rimY - ay * (rimY - capTop) - 0.01 * s;
    const rr = r * s * 0.55;
    const halo = c.createRadialGradient(x, y, 0, x, y, rr * 2.4);
    halo.addColorStop(0, 'rgba(198,164,255,0.55)');
    halo.addColorStop(1, 'rgba(198,164,255,0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, rr * 2.4, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(214,190,255,0.9)';
    c.beginPath();
    c.ellipse(x, y, rr, rr * 0.62, 0, 0, TAU);
    c.fill();
  }
  c.restore();

  // Lantern on a string from the cap's right rim.
  const lx = cx + 0.27 * s;
  const hookY = rimY + 0.01 * s;
  const ly = cy + 0.16 * s;
  const lw = 0.12 * s;
  const lh = 0.15 * s;
  const halo = c.createRadialGradient(lx, ly, 0, lx, ly, 0.26 * s);
  halo.addColorStop(0, 'rgba(255,190,100,0.55)');
  halo.addColorStop(0.4, 'rgba(255,170,80,0.18)');
  halo.addColorStop(1, 'rgba(255,170,80,0)');
  c.fillStyle = halo;
  c.beginPath();
  c.arc(lx, ly, 0.26 * s, 0, TAU);
  c.fill();
  c.strokeStyle = '#0c1122';
  c.lineWidth = Math.max(1.5, 0.008 * s);
  c.beginPath();
  c.moveTo(lx, hookY);
  c.lineTo(lx, ly - lh / 2 - 0.02 * s);
  c.stroke();
  // Top cap of the lantern.
  c.fillStyle = '#2a1904';
  c.beginPath();
  c.moveTo(lx - lw * 0.62, ly - lh / 2 + 0.004 * s);
  c.lineTo(lx - lw * 0.32, ly - lh / 2 - 0.035 * s);
  c.lineTo(lx + lw * 0.32, ly - lh / 2 - 0.035 * s);
  c.lineTo(lx + lw * 0.62, ly - lh / 2 + 0.004 * s);
  c.closePath();
  c.fill();
  // Glass.
  const glass = c.createRadialGradient(lx, ly, 0, lx, ly, lw * 0.7);
  glass.addColorStop(0, '#fff3cf');
  glass.addColorStop(0.5, '#ffcf7a');
  glass.addColorStop(1, '#f19a3e');
  c.fillStyle = glass;
  c.beginPath();
  c.roundRect(lx - lw / 2, ly - lh / 2, lw, lh, lw * 0.28);
  c.fill();
  // Frame bars.
  c.strokeStyle = 'rgba(42,25,4,0.55)';
  c.lineWidth = Math.max(1, 0.006 * s);
  for (const f of [-0.18, 0.18]) {
    c.beginPath();
    c.moveTo(lx + f * lw, ly - lh / 2 + 0.01 * s);
    c.lineTo(lx + f * lw, ly + lh / 2 - 0.01 * s);
    c.stroke();
  }
  // Base.
  c.fillStyle = '#2a1904';
  c.beginPath();
  c.roundRect(lx - lw * 0.42, ly + lh / 2 - 0.004 * s, lw * 0.84, 0.03 * s, 0.01 * s);
  c.fill();

  // Drifting spores.
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 34; i++) {
    const a = rnd() * TAU;
    const d = 0.2 + rnd() * 0.42;
    const x = cx + Math.cos(a) * d * s;
    const y = cy - 0.1 * s + Math.sin(a) * d * s * 0.85;
    const r = (0.004 + rnd() * 0.007) * s;
    c.globalAlpha = 0.35 + rnd() * 0.5;
    c.fillStyle = rnd() < 0.4 ? '#c8a6ff' : '#86f2d6';
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  c.restore();
}

/** "Spore" in text colour, "monger" in lantern gold, left-aligned at x. */
function wordmark(c: Ctx, x: number, y: number, size: number): number {
  c.font = `700 ${size}px Gluten`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const a = 'Spore';
  const wa = c.measureText(a).width;
  c.fillStyle = TEXT;
  c.fillText(a, x, y);
  c.fillStyle = LANTERN;
  c.fillText('monger', x + wa, y);
  return wa + c.measureText('monger').width;
}

/** Font size at which the wordmark is `width` wide. */
function wordmarkSize(c: Ctx, width: number): number {
  c.font = '700 100px Gluten';
  return (100 * width) / c.measureText('Sporemonger').width;
}

async function main(): Promise<void> {
  await Promise.all([document.fonts.load('700 100px Gluten'), document.fonts.load('600 30px Figtree')]);
  const out = document.createElement('canvas');
  const c = out.getContext('2d')!;
  if (kind === 'icon') {
    out.width = out.height = 1024;
    sky(c, 1024, 1024, 520, 860);
    farShroom(c, 150, 870, 300, 200);
    farShroom(c, 890, 870, 360, 220);
    c.fillStyle = '#0a0e19';
    c.fillRect(0, 860, 1024, 164);
    emblem(c, 512, 520, 740);
    awning(c, 0, 1024, 868, 120, 8);
  } else if (kind === 'feature') {
    out.width = 1024;
    out.height = 500;
    sky(c, 1024, 500, 260, 440);
    farShroom(c, 60, 440, 170, 120);
    farShroom(c, 470, 440, 130, 100);
    farShroom(c, 995, 440, 120, 120);
    c.fillStyle = '#0a0e19';
    c.fillRect(0, 436, 1024, 64);
    emblem(c, 270, 250, 400);
    awning(c, 0, 1024, 446, 54, 18);
    const size = wordmarkSize(c, 430);
    wordmark(c, 520, 250, size);
    c.fillStyle = MUTED;
    c.font = '600 30px Figtree';
    c.fillText('Buy low. Sell before it rots.', 524, 304);
  } else {
    out.width = out.height = 2732;
    c.fillStyle = BG;
    c.fillRect(0, 0, 2732, 2732);
    // Only the middle ~1200px column shows on a phone, so keep everything in it.
    const glow = c.createRadialGradient(1366, 1200, 0, 1366, 1200, 760);
    glow.addColorStop(0, 'rgba(124,239,210,0.08)');
    glow.addColorStop(1, 'rgba(124,239,210,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, 2732, 2732);
    // Draw the emblem on its own layer and let the stalk fade out there, so
    // it doesn't stop in mid-air and the glow behind stays seamless.
    const layer = document.createElement('canvas');
    layer.width = layer.height = 2732;
    const l = layer.getContext('2d')!;
    emblem(l, 1366, 1200, 860);
    const fade = l.createLinearGradient(0, 1440, 0, 1640);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    l.globalCompositeOperation = 'destination-out';
    l.fillStyle = fade;
    l.fillRect(0, 1440, 2732, 1292);
    c.drawImage(layer, 0, 0);
    const size = wordmarkSize(c, 900);
    c.font = `700 ${size}px Gluten`;
    wordmark(c, 1366 - 450, 1830, size);
  }
  out.id = 'art';
  document.body.append(out);
  document.body.dataset.ready = '1';
}

void main();
