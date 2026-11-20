import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { nodeDb } from "./node-db";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  console.error("BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32`.");
  process.exit(1);
}
// Origins allowed to call /api/auth (comma-separated). Default: the Astro dev server.
const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "http://localhost:4321")
  .split(",").map((o) => o.trim()).filter(Boolean);

// Public origin (e.g. https://dzingel.example.org); optional.
const baseURL = process.env.BETTER_AUTH_URL;

const db = nodeDb();
const port = Number(process.env.PORT ?? 8787);
const auth = createAuth(db.sqlite, { secret, trustedOrigins, baseURL });
serve({ fetch: createApp(db, auth).fetch, port }, () =>
  console.log(`API on http://localhost:${port}`));
