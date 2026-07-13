import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 88,
        branches: 83,
        functions: 86,
        lines: 88,
      },
    },
    include: ['__tests__/**/*.ts'],
  },
});
