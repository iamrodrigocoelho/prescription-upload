import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
  },
});
