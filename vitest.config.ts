import { fileURLToPath } from 'url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, '**/playwright/**'],
    alias: {
      '~/': fileURLToPath(new URL('./src/', import.meta.url)),
    },
    env: {
      DATABASE_URL: 'postgresql://postgres:example@localhost:5432/ticketing_test',
      NODE_ENV: 'test',
    },
    setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
