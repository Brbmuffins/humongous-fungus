import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The games share this repo. GAME picks which one to serve or build:
//   GAME=fungus vite      GAME=sporemonger vite build
// Each build is one self-contained HTML file (fonts, styles and code
// inlined), so it runs offline in a phone WebView and shares as one page.
const game = process.env.GAME ?? 'fungus';

export default defineConfig({
  root: resolve(__dirname, 'games', game),
  // @hammygotchi is the Hammygotchi source folder, whose arcade rules and
  // screens Hammy's Arcade (games/hammys-arcade) reuses as they are.
  resolve: { alias: { '@shared': resolve(__dirname, 'shared'), '@hammygotchi': resolve(__dirname, 'games', 'hammygotchi', 'src') } },
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: resolve(__dirname, 'dist', game),
    emptyOutDir: true,
  },
});
