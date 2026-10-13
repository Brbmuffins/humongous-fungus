// Renders a game's icon and splash into games/<game>/assets/, ready for
// `npx capacitor-assets generate`, and its Play feature graphic into
// games/<game>/store/play/. Needs that game's dev server running:
//   npm run dev               (then)   node scripts/make-art.mjs fungus
//   npm run dev:sporemonger   (then)   node scripts/make-art.mjs sporemonger
// A second argument overrides the server URL (default http://localhost:5173).
// Uses Playwright from the environment; pass CHROMIUM=/path/to/chrome if needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const game = process.argv[2] ?? 'fungus';
const base = process.argv[3] ?? 'http://localhost:5173';
const out = `games/${game}/assets`;
mkdirSync(out, { recursive: true });
mkdirSync(`games/${game}/store/play`, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 1 });
for (const [kind, files] of [
  ['icon', ['icon-only.png']],
  ['splash', ['splash.png', 'splash-dark.png']],
  ['feature', ['../store/play/feature-graphic.png']],
]) {
  await page.goto(`${base}/tools/art.html?kind=${kind}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  const data = await page.evaluate(() => document.getElementById('art').toDataURL('image/png'));
  const png = Buffer.from(data.split(',')[1], 'base64');
  for (const f of files) writeFileSync(`${out}/${f}`, png);
  console.log(`${kind}: ${files.join(', ')} (${(png.length / 1024).toFixed(0)} KB)`);
}
await browser.close();
