import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { nodeDb } from "./node-db";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp(nodeDb()).fetch, port }, () =>
  console.log(`API on http://localhost:${port}`));
