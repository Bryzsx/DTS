import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One worker: the PGlite database tests share a single embedded instance,
    // so running files in parallel would contend for the same data directory.
    maxWorkers: 1,
    fileParallelism: false,
    setupFiles: [resolve(__dirname, "src/__tests__/setup.ts")],
  },
})
