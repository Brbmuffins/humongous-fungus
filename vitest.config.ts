import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'shared'), '@hammygotchi': resolve(__dirname, 'games', 'hammygotchi', 'src') } },
  test: { include: ['tests/**/*.test.ts'] },
});
