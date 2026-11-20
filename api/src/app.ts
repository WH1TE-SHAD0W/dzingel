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
// Every route is scoped to groups the user is a member of. A group or quote the user cannot
// access answers 404, exactly like one that does not exist, so existence is not leaked.

const isMember = async (groupId: number, userId: string) =>
  (await db.all("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?", groupId, userId))
    .length > 0;

const notFound = (c: Context<Env>) => c.json({ error: "not found" }, 404);
const invalid = (c: Context<Env>) => c.json({ error: "invalid input" }, 400);

/** Positive integer id from a JSON body value. */
const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
/** Positive integer id from a path/query string; null if absent or malformed. */
const parseId = (v: string | undefined): number | null =>
  v !== undefined && /^[1-9]\d{0,14}$/.test(v) ? Number(v) : null;

const Q_MAX = 100;
// Backslash is the LIKE escape character (`ESCAPE '\'` below): match %, _ and \ literally.
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

// --- User directory (for inviting) ---------------------------------------------------------
// ?q=<substring>. Returns only id + username; the caller is excluded (cannot invite yourself).
// An empty q returns an empty list rather than a page of everyone.
const USERS_Q_MAX = 30; // = max username length
const USERS_LIMIT = 20;

app.get("/api/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length > USERS_Q_MAX) return invalid(c);
  if (!q) return c.json([]);
  return c.json(
    await db.all(
      `SELECT id, username FROM "user"
       WHERE username IS NOT NULL AND id <> ? AND username LIKE ? ESCAPE '\\'
       ORDER BY username LIMIT ?`,
      c.get("user").id, likePattern(q), USERS_LIMIT,
    ),
  );
});

app.get("/api/groups", async (c) =>
  c.json(
    await db.all(
      `SELECT g.id, g.name FROM groups g JOIN group_members m ON m.group_id = g.id
       WHERE m.user_id = ? ORDER BY g.name, g.id`,
      c.get("user").id,
    ),
  ));

app.post("/api/groups", async (c) => {
  const name = str((await readJson(c))?.name, 100);
  if (!name) return c.json({ error: "invalid name" }, 400);
  const userId = c.get("user").id;
  const { id } = await db.run("INSERT INTO groups (name, created_by) VALUES (?, ?)", name, userId);
  try {
    await db.run("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", id, userId);
  } catch (err) {
    // No transaction in the Db interface: undo so no memberless group is left behind.
    await db.run("DELETE FROM groups WHERE id = ?", id);
    throw err;
  }
  return c.json({ id, name }, 201);
});

// ?group=<id>&q=<keyword>
app.get("/api/quotes", async (c) => {
  const group = parseId(c.req.query("group"));
  const rawQ = c.req.query("q") ?? "";
  if (group === null || rawQ.length > Q_MAX) return invalid(c);
  if (!(await isMember(group, c.get("user").id))) return notFound(c);
  const q = likePattern(rawQ);
  return c.json(
    await db.all(
      `SELECT q.id, q.group_id, q.text, q.context, q.created_at, u.username AS author
       FROM quotes q LEFT JOIN "user" u ON u.id = q.created_by
       WHERE q.group_id = ? AND (q.text LIKE ? ESCAPE '\\' OR q.context LIKE ? ESCAPE '\\')
       ORDER BY q.created_at DESC, q.id DESC`,
      group, q, q,
    ),
  );
});

app.post("/api/quotes", async (c) => {
  const b = await readJson(c);
  if (!b) return invalid(c);
  const text = str(b.text, 1000);
  const context = typeof b.context === "string" ? b.context.slice(0, 2000) : "";
  if (!text || !isId(b.group_id)) return invalid(c);
  const userId = c.get("user").id;
  if (!(await isMember(b.group_id, userId))) return notFound(c);
  const { id } = await db.run(
    "INSERT INTO quotes (group_id, text, context, created_by) VALUES (?, ?, ?, ?)",
    b.group_id, text, context, userId,
  );
  return c.json({ id }, 201);
});

// Update/delete match only quotes in the user's groups; zero changed rows → 404.
const MEMBER_QUOTE = "id = ? AND group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)";

app.put("/api/quotes/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const b = await readJson(c);
  if (id === null || !b) return invalid(c);
  const text = str(b.text, 1000);
  const context = typeof b.context === "string" ? b.context.slice(0, 2000) : "";
  if (!text) return invalid(c);
  const { changes } = await db.run(
    `UPDATE quotes SET text = ?, context = ? WHERE ${MEMBER_QUOTE}`,
    text, context, id, c.get("user").id,
  );
  return changes ? c.json({ ok: true }) : notFound(c);
});

app.delete("/api/quotes/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return invalid(c);
  const { changes } = await db.run(
    `DELETE FROM quotes WHERE ${MEMBER_QUOTE}`, id, c.get("user").id,
  );
  return changes ? c.json({ ok: true }) : notFound(c);
});

// --- Invites -------------------------------------------------------------------------------
// A non-member gets 403 whether or not the group exists, so existence is not leaked. An invite
// that is not addressed to the caller answers 404, like one that does not exist.

app.post("/api/groups/:id/invites", async (c) => {
  const group = parseId(c.req.param("id"));
  const raw = (await readJson(c))?.username;
  const username = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (group === null || !USERNAME_RE.test(username)) return invalid(c);
  const inviterId = c.get("user").id;
  if (!(await isMember(group, inviterId))) return c.json({ error: "forbidden" }, 403);
  const [invitee] = await db.all<{ id: string }>(
    `SELECT id FROM "user" WHERE username = ?`, username,
  );
  if (!invitee) return notFound(c);
  // One statement: skipped if the invitee is already a member (WHERE NOT EXISTS) or already has
  // a pending invite (partial unique index + OR IGNORE). Either way no row → 409.
  const { id, changes } = await db.run(
    `INSERT OR IGNORE INTO group_invites (group_id, inviter_id, invitee_id)
     SELECT ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?)`,
    group, inviterId, invitee.id, group, invitee.id,
  );
  if (!changes) return c.json({ error: "already a member or invited" }, 409);
  return c.json({ id, group_id: group, invitee_id: invitee.id, status: "pending" }, 201);
});

// The caller's pending invites, newest first.
app.get("/api/invites", async (c) =>
  c.json(
    await db.all(
      `SELECT i.id, i.group_id, g.name AS group_name, u.username AS inviter, i.created_at
       FROM group_invites i
       JOIN groups g ON g.id = i.group_id
       LEFT JOIN "user" u ON u.id = i.inviter_id
       WHERE i.invitee_id = ? AND i.status = 'pending'
       ORDER BY i.created_at DESC, i.id DESC`,
      c.get("user").id,
    ),
  ));

type Invite = { group_id: number; status: string };

const answered = (c: Context<Env>) => c.json({ error: "invite already answered" }, 409);

/** Load an invite addressed to the caller; a Response if it is missing (404) or answered (409). */
const ownPendingInvite = async (c: Context<Env>): Promise<(Invite & { id: number }) | Response> => {
  const id = parseId(c.req.param("id"));
  if (id === null) return invalid(c);
  const [inv] = await db.all<Invite>(
    "SELECT group_id, status FROM group_invites WHERE id = ? AND invitee_id = ?",
    id, c.get("user").id,
  );
  if (!inv) return notFound(c);
  if (inv.status !== "pending") return answered(c);
  return { id, ...inv };
};

/** Mark a pending invite answered; false if it was answered concurrently. */
const respond = async (id: number, status: "accepted" | "declined") =>
  (await db.run(
    `UPDATE group_invites SET status = ?, responded_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
    status, id,
  )).changes > 0;

app.post("/api/invites/:id/accept", async (c) => {
  const inv = await ownPendingInvite(c);
  if (inv instanceof Response) return inv;
  // Claim the invite first so a concurrent accept/decline cannot also succeed.
  if (!(await respond(inv.id, "accepted"))) return answered(c);
  try {
    await db.run(
      "INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)",
      inv.group_id, c.get("user").id,
    );
  } catch (err) {
    // No transaction in the Db interface: put the invite back to pending.
    await db.run(
      "UPDATE group_invites SET status = 'pending', responded_at = NULL WHERE id = ?", inv.id,
    );
    throw err;
  }
  return c.json({ ok: true, group_id: inv.group_id });
});

app.post("/api/invites/:id/decline", async (c) => {
  const inv = await ownPendingInvite(c);
  if (inv instanceof Response) return inv;
  if (!(await respond(inv.id, "declined"))) return answered(c);
  return c.json({ ok: true });
});

return app;
}
