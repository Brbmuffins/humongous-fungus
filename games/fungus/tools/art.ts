// Renders the app icon and launch screen from the game's own jar renderer.
// Served by Vite (npm run dev), opened by scripts/make-art.mjs:
//   /tools/art.html?kind=icon     1024×1024, opaque
//   /tools/art.html?kind=splash   2732×2732, jar and wordmark in the middle
//   /tools/art.html?kind=feature  1024×500, Google Play feature graphic
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import { JarRenderer, type WorldView } from '../src/render/jar';

const kind = new URLSearchParams(location.search).get('kind') ?? 'icon';
const BG = '#16110d';

function jarCanvas(size: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  document.body.append(c);
  const r = new JarRenderer(c);
  const view: WorldView = {
    counts: { hyphae: 140, bonnet: 70, moss: 60, springtail: 30, fern: 20, pillbug: 10, snail: 4, frog: 2 },
    specimens: new Set(['glowcap', 'sundew', 'coral']),
    jarIndex: 0,
    seed: 20251,
    rate: 1e5,
    network: 520,
    frenzy: false,
    bloom: null,
    now: Date.now(),
  };
  return new Promise((resolve) => {
    let frames = 0;
    const tick = (t: number) => {
      r.setView(view);
      r.draw(t);
      if (++frames < 40) requestAnimationFrame(tick);
      else {
        c.remove();
        resolve(c);
      }
    };
    requestAnimationFrame(tick);
  });
}

async function main(): Promise<void> {
  // Fonts load lazily; ask for the faces the wordmark needs before drawing.
  await Promise.all([
    document.fonts.load('400 128px "Instrument Serif"'),
    document.fonts.load('italic 400 128px "Instrument Serif"'),
  ]);
  const out = document.createElement('canvas');
  const ctx = out.getContext('2d')!;
  if (kind === 'icon') {
    out.width = out.height = 1024;
    const jar = await jarCanvas(1024);
    ctx.drawImage(jar, 0, 0, 1024, 1024);
    // Fade the edges into the background so the icon sits well in any mask.
    const v = ctx.createRadialGradient(512, 470, 380, 512, 512, 760);
    v.addColorStop(0, 'rgba(22,17,13,0)');
    v.addColorStop(1, BG);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 1024, 1024);
  } else if (kind === 'feature') {
    out.width = 1024;
    out.height = 500;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, 1024, 500);
    const jar = await jarCanvas(1024);
    const size = 480;
    const cx = 270;
    const cy = 250;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 330);
    glow.addColorStop(0, 'rgba(233,179,95,0.14)');
    glow.addColorStop(1, 'rgba(233,179,95,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1024, 500);
    ctx.drawImage(jar, cx - size / 2, cy - size / 2, size, size);
    const fade = ctx.createRadialGradient(cx, cy - 10, size * 0.34, cx, cy, size * 0.6);
    fade.addColorStop(0, 'rgba(22,17,13,0)');
    fade.addColorStop(1, BG);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 1024, 500);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#efe6d6';
    ctx.font = '400 84px "Instrument Serif"';
    ctx.fillText('Humongous', 540, 228);
    ctx.fillStyle = '#eab460';
    ctx.font = 'italic 400 84px "Instrument Serif"';
    ctx.fillText('Fungus', 540, 306);
    ctx.fillStyle = '#a9ae98';
    ctx.font = 'italic 400 34px "Instrument Serif"';
    ctx.fillText('Small jar. Humongous fungus.', 542, 360);
  } else {
    out.width = out.height = 2732;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, 2732, 2732);
    const jar = await jarCanvas(1024);
    // Only the middle ~1200px column shows on a phone, so keep everything in it.
    const size = 760;
    const glow = ctx.createRadialGradient(1366, 1250, 0, 1366, 1250, 700);
    glow.addColorStop(0, 'rgba(233,179,95,0.10)');
    glow.addColorStop(1, 'rgba(233,179,95,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 2732, 2732);
    ctx.drawImage(jar, 1366 - size / 2, 1230 - size / 2, size, size);
    // Melt the square edges of the jar's room into the background.
    const fade = ctx.createRadialGradient(1366, 1200, size * 0.36, 1366, 1230, size * 0.62);
    fade.addColorStop(0, 'rgba(22,17,13,0)');
    fade.addColorStop(1, BG);
    ctx.fillStyle = fade;
    ctx.fillRect(1366 - size, 1230 - size, size * 2, size * 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#efe6d6';
    ctx.font = '400 128px "Instrument Serif"';
    const a = 'Humongous ';
    const b = 'Fungus';
    const wa = ctx.measureText(a).width;
    ctx.font = 'italic 400 128px "Instrument Serif"';
    const wb = ctx.measureText(b).width;
    const x0 = 1366 - (wa + wb) / 2;
    ctx.textAlign = 'left';
    ctx.font = '400 128px "Instrument Serif"';
    ctx.fillText(a, x0, 1780);
    ctx.fillStyle = '#eab460';
    ctx.font = 'italic 400 128px "Instrument Serif"';
    ctx.fillText(b, x0 + wa, 1780);
  }
  out.id = 'art';
  document.body.append(out);
  document.body.dataset.ready = '1';
}

void main();
