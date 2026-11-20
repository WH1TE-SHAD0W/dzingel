// Better Auth factory. Runtime-neutral: the caller passes its own driver (node:sqlite
// `DatabaseSync` or a Cloudflare D1 binding); Better Auth's built-in Kysely dialects handle both.
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { username } from "better-auth/plugins";

export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export interface AuthOptions {
  /** Signing secret, from `BETTER_AUTH_SECRET`. Required. */
  secret: string;
  /** Extra origins allowed to call auth endpoints (e.g. the Astro dev server on :4321). */
  trustedOrigins?: string[];
}

export function createAuth(database: BetterAuthOptions["database"], options: AuthOptions) {
  if (!options.secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return betterAuth({
    database,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (u) => USERNAME_RE.test(u),
        displayUsername: false,
      }),
    ],
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
