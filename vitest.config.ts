import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'shared/__tests__/**/*.test.ts',
      'server/__tests__/**/*.test.ts',
      'client/__tests__/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['shared/src/**/*.ts'],
      exclude: ['shared/src/index.ts', 'shared/src/types.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
