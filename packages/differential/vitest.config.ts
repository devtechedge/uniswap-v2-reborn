import { defineConfig } from "vitest/config";

// Differential suites execute thousands of EVM calls; CI runners are much slower than a dev box.
export default defineConfig({ test: { testTimeout: 900_000, hookTimeout: 120_000 } });
