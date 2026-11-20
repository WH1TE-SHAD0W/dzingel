import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { Db } from "./db";
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE, type Auth } from "./auth";

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;

/** The signed-in user, available as `c.get("user")` on every protected route. */
export type AuthUser = { id: string; username: string };
type Env = { Variables: { user: AuthUser } };

const toUser = (u: { id: string; username?: string | null }): AuthUser => ({
  id: u.id,
  username: u.username ?? "",
});

// Raw Better Auth sign-up/sign-in endpoints are reachable only through the wrappers below.
const BLOCKED_AUTH_PATH = /^\/api\/auth\/+sign-(up|in)(\/|$)/i;

export function createApp(db: Db, auth: Auth) {
const app = new Hono<Env>();

const copyCookies = (c: Context<Env>, from: Headers) => {
  for (const v of from.getSetCookie()) c.header("set-cookie", v, { append: true });
};

// Re-issue the request to Better Auth's own router so its CSRF/origin checks and rate limiting
// still apply. Original headers (cookie, origin, sec-fetch-*, forwarded-for) are kept.
const forward = (c: Context<Env>, path: string, body: unknown) => {
  const url = new URL(c.req.url);
  url.pathname = `/api/auth${path}`;
  url.search = "";
  const headers = new Headers(c.req.raw.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return auth.handler(new Request(url, { method: "POST", headers, body: JSON.stringify(body) }));
};

const errorCode = async (res: Response) =>
  ((await res.json().catch(() => null)) as { code?: string } | null)?.code;

// Statuses that are not credential/validation failures are passed through generically.
const passthrough = (c: Context<Env>, status: number) =>
  status === 429 ? c.json({ error: "too many requests" }, 429)
  : status === 403 ? c.json({ error: "forbidden" }, 403)
  : c.json({ error: "internal error" }, 500);

// Only accept application/json: cross-site forms cannot send it without a CORS preflight, which
// blocks login/register CSRF (these requests carry no cookie, so no origin check applies).
const readJson = async (c: Context<Env>): Promise<Record<string, unknown> | null> => {
  if (!/^application\/json\b/i.test(c.req.header("content-type") ?? "")) return null;
  const b: unknown = await c.req.json().catch(() => null);
  return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
};

const requireSession: MiddlewareHandler<Env> = async (c, next) => {
  const { headers, response } = await auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
  copyCookies(c, headers); // refreshed or cleared session cookie
  if (!response) return c.json({ error: "unauthorized" }, 401);
  c.set("user", toUser(response.user));
  await next();
};

// --- Auth ----------------------------------------------------------------------------------

app.post("/api/auth/register", async (c) => {
  const body = await readJson(c);
  if (!body) return c.json({ error: "invalid input" }, 400);
  const { username, password } = body;
  const fields: Record<string, string> = {};
  if (typeof username !== "string" || !USERNAME_RE.test(username))
    fields.username = "must be 3-30 characters of a-z, 0-9, _ or .";
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
    fields.password = `must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`;
  if (Object.keys(fields).length) return c.json({ error: "invalid input", fields }, 400);

  // Better Auth requires an email; store an internal non-routable placeholder, never shown.
  const res = await forward(c, "/sign-up/email", {
    name: username,
    email: `${crypto.randomUUID()}@users.dzingel.invalid`,
    username,
    password,
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 422) {
      return (await errorCode(res)) === "USERNAME_IS_ALREADY_TAKEN"
        ? c.json({ error: "username taken", fields: { username: "is already taken" } }, 409)
        : c.json({ error: "invalid input" }, 400);
    }
    return passthrough(c, res.status);
  }
  const { user } = (await res.json()) as { user: { id: string; username?: string } };
  copyCookies(c, res.headers);
  return c.json({ user: toUser(user) }, 201);
});

app.post("/api/auth/login", async (c) => {
  const { username, password } = (await readJson(c)) ?? {};
  if (typeof username !== "string" || typeof password !== "string")
    return c.json({ error: "invalid input" }, 400);
  const res = await forward(c, "/sign-in/username", { username, password });
  if (!res.ok) {
    // One message for unknown user, wrong password and malformed username alike.
    if ([400, 401, 422].includes(res.status)) return c.json({ error: "invalid credentials" }, 401);
    return passthrough(c, res.status);
  }
  // The session token stays in the httpOnly cookie only; it is not returned in the body.
  const { user } = (await res.json()) as { user: { id: string; username?: string } };
  copyCookies(c, res.headers);
  return c.json({ user: toUser(user) });
});

app.post("/api/auth/logout", async (c) => {
  const res = await forward(c, "/sign-out", {});
  if (!res.ok) return passthrough(c, res.status);
  copyCookies(c, res.headers);
  return c.json({ ok: true });
});

app.get("/api/auth/me", requireSession, (c) => c.json({ user: c.get("user") }));

// Remaining Better Auth endpoints (get-session, sign-out, change-password, …).
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  BLOCKED_AUTH_PATH.test(new URL(c.req.url).pathname)
    ? c.json({ error: "not found" }, 404)
    : auth.handler(c.req.raw));

// Everything else under /api requires a valid session.
app.use("/api/*", (c, next) =>
  c.req.path.startsWith("/api/auth/") ? next() : requireSession(c, next));

// --- Groups & quotes -----------------------------------------------------------------------

app.get("/api/groups", async (c) => c.json(await db.all("SELECT * FROM groups ORDER BY name")));

app.post("/api/groups", async (c) => {
  const name = str((await c.req.json()).name, 100);
  if (!name) return c.json({ error: "invalid name" }, 400);
  const { id } = await db.run("INSERT INTO groups (name) VALUES (?)", name);
  return c.json({ id, name }, 201);
});

// ?group=<id>&q=<keyword>
app.get("/api/quotes", async (c) => {
  const group = Number(c.req.query("group"));
  const q = `%${c.req.query("q") ?? ""}%`;
  return c.json(
    await db.all(
      `SELECT * FROM quotes WHERE group_id = ? AND (text LIKE ? OR context LIKE ?)
       ORDER BY created_at DESC, id DESC`,
      group, q, q,
    ),
  );
});

app.post("/api/quotes", async (c) => {
  const b = await c.req.json();
  const text = str(b.text, 1000);
  const context = typeof b.context === "string" ? b.context.slice(0, 2000) : "";
  if (!text || !Number.isInteger(b.group_id)) return c.json({ error: "invalid input" }, 400);
  const { id } = await db.run(
    "INSERT INTO quotes (group_id, text, context) VALUES (?, ?, ?)",
    b.group_id, text, context,
  );
  return c.json({ id }, 201);
});

app.put("/api/quotes/:id", async (c) => {
  const b = await c.req.json();
  const text = str(b.text, 1000);
  const context = typeof b.context === "string" ? b.context.slice(0, 2000) : "";
  if (!text) return c.json({ error: "invalid input" }, 400);
  const { changes } = await db.run(
    "UPDATE quotes SET text = ?, context = ? WHERE id = ?", text, context, c.req.param("id"),
  );
  return changes ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

app.delete("/api/quotes/:id", async (c) => {
  await db.run("DELETE FROM quotes WHERE id = ?", c.req.param("id"));
  return c.json({ ok: true });
});

return app;
}
