import { createApp } from "./app";
import { createAuth } from "./auth";
import { d1Db } from "./d1-db";

type Env = {
  DB: D1Database;
  /** Set with `wrangler secret put BETTER_AUTH_SECRET`. */
  BETTER_AUTH_SECRET?: string;
  /** Optional comma-separated extra origins allowed to call /api/auth. */
  TRUSTED_ORIGINS?: string;
};

let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(req: Request, env: Env) {
    // createAuth throws "BETTER_AUTH_SECRET is not set" if the secret is missing.
    app ??= createApp(
      d1Db(env.DB),
      createAuth(env.DB, {
        secret: env.BETTER_AUTH_SECRET ?? "",
        trustedOrigins: env.TRUSTED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
      }),
    );
    return app.fetch(req);
  },
};
