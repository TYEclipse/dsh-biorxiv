import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/apps/dsh/**', 'src/apps/cli/main.ts', 'src/apps/mcp/main.ts', 'src/index.ts', 'src/core/types.ts', 'src/core/summary.ts'],
    },
  },
})
