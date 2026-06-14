import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  envDir: monorepoRoot,
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: ['reggroundweb-production.up.railway.app', 'app.thinkertons.com'],
  },
  cacheDir: '/tmp/vite-cache',
});
