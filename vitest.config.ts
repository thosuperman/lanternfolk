import { defineConfig } from 'vitest/config';

// Unit tests cover the pure gameplay rules only; they must not start the IWSDK dev plugin.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
