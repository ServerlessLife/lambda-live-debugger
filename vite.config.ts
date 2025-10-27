/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 300000,
    silent: false,
    maxConcurrency: 1,
  },
});
