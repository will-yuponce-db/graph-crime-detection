import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.tsx'],
    exclude: ['backend/**', 'dist/**', 'node_modules/**'],
    environment: 'node',
  },
});

