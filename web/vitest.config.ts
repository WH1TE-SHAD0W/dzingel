import { defineConfig } from "vitest/config";

// Unit tests for DOM-free frontend logic only (no jsdom); page scripts are not imported.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
