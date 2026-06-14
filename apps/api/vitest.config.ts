import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@regground/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@regground/sandbox': resolve(__dirname, '../../packages/sandbox/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
  },
});
