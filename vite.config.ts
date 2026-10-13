import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file: fonts, styles and code all inlined, so the
// game runs offline in a phone WebView and can be shared as a single page.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2020' },
});
