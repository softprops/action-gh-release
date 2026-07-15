import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 94,
        branches: 90,
        functions: 95,
        lines: 94,
      },
    },
    include: ['__tests__/**/*.ts'],
  },
});
