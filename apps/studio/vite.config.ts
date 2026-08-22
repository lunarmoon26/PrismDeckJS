import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/PrismDeckJS/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      prismdeckjs: fileURLToPath(new URL('../../packages/prismdeck/src/index.ts', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
