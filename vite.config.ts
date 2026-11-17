import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works on any GitHub Pages path.
  base: './',
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/vite-env.d.ts'],
      reporter: ['text', 'html'],
    },
  },
});
