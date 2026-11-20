/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Astro's Vite config, so .astro pages can be rendered (Container API) in the global setup.
// - test/*.test.ts: DOM-free logic, Node environment.
// - test/dom/*.test.ts: page behaviour in happy-dom (`// @vitest-environment happy-dom` per file).
//   The pages are rendered once, server-side, in test/dom/render-pages.ts and passed to the
//   tests with provide/inject; each test loads one into the DOM and imports its scripts.
export default getViteConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globalSetup: ["test/dom/render-pages.ts"],
  },
});
