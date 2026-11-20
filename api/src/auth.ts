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
  /**
   * Public origin of the app, from `BETTER_AUTH_URL` (e.g. `https://dzingel.example.org`). When
   * unset, Better Auth falls back to its own detection (env on Node, else the request URL).
   */
  baseURL?: string;
  /**
   * Rate limiting of Better Auth's endpoints (sign-up/sign-in: 3 per 10 s per client IP; others:
   * 100 per 10 s). Default `true`. Turn off only in tests that create many sessions quickly.
   */
  rateLimit?: boolean;
  /**
   * Request headers holding the client IP, tried in order; used as the rate-limit key. A header
   * is trusted only if the proxy in front overwrites it, so pick it per deployment. Default
   * `["x-forwarded-for"]` (self-host behind NGINX: `proxy_set_header X-Forwarded-For $remote_addr`).
   */
  ipAddressHeaders?: string[];
}

export function createAuth(database: BetterAuthOptions["database"], options: AuthOptions) {
  if (!options.secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return betterAuth({
    database,
    secret: options.secret,
    baseURL: options.baseURL || undefined,
    trustedOrigins: options.trustedOrigins,
    // Explicit: Better Auth would enable it only when NODE_ENV === "production" at load time,
    // which nothing sets (and Workers do not populate process.env). Storage is in-memory, i.e.
    // per Node process / per Workers isolate: a best-effort limit, not a global one.
    rateLimit: { enabled: options.rateLimit ?? true, storage: "memory" },
    advanced: {
      // Explicit: Better Auth turns the origin/CSRF check off when NODE_ENV === "test" or TEST
      // is truthy, so an environment variable must not be able to disable it.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders: options.ipAddressHeaders ?? ["x-forwarded-for"] },
    },
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
