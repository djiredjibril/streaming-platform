import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['services/*/tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['services/*/src/domain/**/*.ts', 'packages/*/src/**/*.ts'],
    },
  },
});
