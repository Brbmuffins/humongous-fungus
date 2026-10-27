import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Bundles Hammy's Arcade's server (games/hammys-arcade/server) and the rules it
// reuses from Hammygotchi into ONE file that runs with plain Node:
//   dist/hammys-arcade-server/server.mjs
// The imports in the sources have no .ts extensions, so Node can't run them
// as they are; no runtime dependencies, so nothing needs installing beside it.
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'shared'), '@hammygotchi': resolve(__dirname, 'games', 'hammygotchi', 'src') } },
  ssr: { noExternal: true },
  build: {
    ssr: resolve(__dirname, 'games', 'hammys-arcade', 'server', 'main.ts'),
    target: 'node22',
    outDir: process.env.ARCADE_SERVER_OUT ?? resolve(__dirname, 'dist', 'hammys-arcade-server'),
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { format: 'es', entryFileNames: 'server.mjs' } },
  },
});
