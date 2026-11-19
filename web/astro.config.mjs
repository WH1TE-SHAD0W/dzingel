import { defineConfig } from "astro/config";

// In dev, proxy /api to the Hono server. In production nginx does the same.
export default defineConfig({
  vite: { server: { proxy: { "/api": "http://localhost:8787" } } },
});
