import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 93,
        branches: 89,
        functions: 95,
        lines: 93,
      },
    },
    include: ['__tests__/**/*.ts'],
  },
});
