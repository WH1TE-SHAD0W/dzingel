// #2 Username and password authentication with Better Auth.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "../src/auth";
import { migrate, nodeDb } from "../src/node-db";
import { cookieFrom, harness, ORIGIN, PASSWORD, type Harness } from "./helpers";

let h: Harness;
beforeEach(() => {
  h = harness();
});

const userCount = async () =>
  ((await h.db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM "user"`))[0]).n;

const register = (body: unknown) => h.req("POST", "/api/auth/register", { body });
const login = (body: unknown) => h.req("POST", "/api/auth/login", { body });
const logout = (cookie: string, origin: string | null = ORIGIN) =>
  h.req("POST", "/api/auth/logout", {
    cookie,
    body: {},
    headers: origin ? { origin } : {},
  });
const me = (cookie?: string) => h.req("GET", "/api/auth/me", { cookie });

describe("#2 AC1 register: creates a user, validates username and password", () => {
  it("POST /api/auth/register returns 201 with {id, username}, a session cookie and no password", async () => {
    const res = await register({ username: "alex.dev", password: PASSWORD });
    expect(res.status).toBe(201);
    const raw = await res.text();
    const body = JSON.parse(raw) as { user: Record<string, unknown> };
    expect(Object.keys(body)).toEqual(["user"]);
    expect(Object.keys(body.user).sort()).toEqual(["id", "username"]);
    expect(body.user.username).toBe("alex.dev");
    expect(typeof body.user.id).toBe("string");
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toMatch(/password|token|email|dzingel\.invalid/i);
    expect(cookieFrom(res)).toMatch(/session_token=/);
    expect(await userCount()).toBe(1);
  });

  it("stores the password hashed, not in plain text", async () => {
    await h.register("alex.dev");
    const rows = await h.db.all<{ password: string }>(`SELECT password FROM account`);
    expect(rows).toHaveLength(1);
    expect(rows[0].password).not.toBe(PASSWORD);
    expect(rows[0].password).not.toContain(PASSWORD);
  });

  it.each(["abc", "a".repeat(30), "alex_dev.01", "0123456789", "..._"])(
    "accepts the valid username %j",
    async (username) => {
      const res = await register({ username, password: PASSWORD });
      expect(res.status).toBe(201);
    },
  );

  it.each([
    ["2 chars (one under)", "ab"],
    ["31 chars (one over)", "a".repeat(31)],
    ["uppercase", "Alex.Dev"],
    ["all uppercase", "ALEXDEV"],
    ["hyphen", "alex-dev"],
    ["space inside", "alex dev"],
    ["leading/trailing spaces", " alex.dev "],
    ["@ sign (email-like)", "alex.dev@example.org"],
    ["diacritics", "džingel"],
    ["emoji", "alex🎵"],
    ["SQL metacharacters", "a' OR '1'='1"],
    ["HTML payload", "<script>"],
    ["empty string", ""],
    ["number", 12345678],
    ["null", null],
  ])("rejects a username with %s: 400 with a username field message", async (_l, username) => {
    const res = await register({ username, password: PASSWORD });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(body.error).toBe("invalid input");
    expect(Object.keys(body.fields)).toEqual(["username"]);
    expect(body.fields.username).toMatch(/3-30/);
    expect(await userCount()).toBe(0);
  });

  it("rejects a missing username with a username field message", async () => {
    const res = await register({ password: PASSWORD });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { fields: object }).fields).toHaveProperty("username");
  });

  it.each([
    ["exactly 8 chars", "p".repeat(8)],
    ["exactly 128 chars", "p".repeat(128)],
    ["unicode", "pässwörd🎵🎵"],
    ["only spaces", " ".repeat(8)],
  ])("accepts a password of %s", async (_l, password) => {
    const res = await register({ username: "alex.dev", password });
    expect(res.status).toBe(201);
  });

  it.each([
    ["7 chars (one under)", "p".repeat(7)],
    ["129 chars (one over)", "p".repeat(129)],
    ["empty", ""],
    ["non-string", 12345678],
    ["missing", undefined],
  ])("rejects a password of %s: 400 with a password field message", async (_l, password) => {
    const res = await register({ username: "alex.dev", password });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields)).toEqual(["password"]);
    expect(body.fields.password).toMatch(/8-128/);
    expect(await userCount()).toBe(0);
  });

  it("reports both field errors at once", async () => {
    const res = await register({ username: "A", password: "short" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields).sort()).toEqual(["password", "username"]);
  });

  it.each([
    ["text/plain content type", "text/plain", JSON.stringify({ username: "alex.dev", password: PASSWORD })],
    ["form-urlencoded", "application/x-www-form-urlencoded", `username=alex.dev&password=${PASSWORD}`],
    ["malformed JSON", "application/json", "{nope"],
    ["JSON null", "application/json", "null"],
    ["no body", "application/json", undefined],
  ])("rejects %s with 400 and creates nothing", async (_l, type, raw) => {
    const res = await h.app.request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": type },
      body: raw,
    });
    expect(res.status).toBe(400);
    expect(await userCount()).toBe(0);
  });

  it("never stores or returns the placeholder email to the client", async () => {
    const alex = await h.register("alex.dev");
    const [{ email }] = await h.db.all<{ email: string }>(`SELECT email FROM "user"`);
    expect(email).toMatch(/@users\.dzingel\.invalid$/);
    const responses = [
      await login({ username: "alex.dev", password: PASSWORD }),
      await me(alex.cookie),
      await h.as(await h.register("sam.dev")).get("/api/users?q=alex"),
    ];
    for (const res of responses) {
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(email);
      expect(text).not.toMatch(/email|dzingel\.invalid/i);
    }
  });
});

describe("#2 AC2 register: taken username", () => {
  it("returns 409 with a username field message and creates nothing", async () => {
    await h.register("alex.dev");
    const res = await register({ username: "alex.dev", password: "another-pass-2" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(body.error).toBe("username taken");
    expect(body.fields).toEqual({ username: "is already taken" });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await userCount()).toBe(1);
    // The original password still works; the new one does not.
    expect((await login({ username: "alex.dev", password: PASSWORD })).status).toBe(200);
    expect((await login({ username: "alex.dev", password: "another-pass-2" })).status).toBe(401);
  });
});

describe("#2 AC3 login", () => {
  beforeEach(async () => {
    await h.register("alex.dev");
  });

  it("valid credentials: 200, {user:{id,username}}, httpOnly session cookie, no token in body", async () => {
    const res = await login({ username: "alex.dev", password: PASSWORD });
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw) as { user: Record<string, unknown> };
    expect(Object.keys(body.user).sort()).toEqual(["id", "username"]);
    expect(body.user.username).toBe("alex.dev");
    expect(raw).not.toMatch(/token|password/i);

    const session = res.headers.getSetCookie().find((c) => /session_token=/.test(c));
    expect(session).toBeDefined();
    expect(session).toMatch(/;\s*HttpOnly/i);
    expect(session).toMatch(/;\s*SameSite=Lax/i);
    expect(session).toMatch(/;\s*Path=\//i);

    // The cookie authenticates.
    expect((await me(cookieFrom(res))).status).toBe(200);
  });

  it("wrong password and unknown user give the same 401 response", async () => {
    const wrongPw = await login({ username: "alex.dev", password: "wrong-pass-9" });
    const unknown = await login({ username: "nobody.here", password: PASSWORD });
    const malformed = await login({ username: "NOT VALID!", password: PASSWORD });
    for (const res of [wrongPw, unknown, malformed]) {
      expect(res.status).toBe(401);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    const bodies = await Promise.all([wrongPw, unknown, malformed].map((r) => r.json()));
    expect(bodies).toEqual([
      { error: "invalid credentials" },
      { error: "invalid credentials" },
      { error: "invalid credentials" },
    ]);
  });

  it.each([
    ["missing password", { username: "alex.dev" }],
    ["missing username", { password: PASSWORD }],
    ["non-string password", { username: "alex.dev", password: 12345678 }],
    ["empty object", {}],
  ])("%s: 400", async (_l, body) => {
    const res = await login(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
  });

  it("text/plain body: 400 even with valid credentials (CSRF guard)", async () => {
    const res = await h.app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ username: "alex.dev", password: PASSWORD }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("#2 AC4 logout", () => {
  it("with Origin: 200, clears the cookie, and the old cookie no longer authenticates", async () => {
    const alex = await h.register("alex.dev");
    expect((await me(alex.cookie)).status).toBe(200);
    const res = await logout(alex.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cleared = res.headers.getSetCookie().find((c) => /session_token=/.test(c));
    expect(cleared).toMatch(/session_token=;|Max-Age=0/i);

    expect((await me(alex.cookie)).status).toBe(401);
    expect((await h.as(alex).get("/api/groups")).status).toBe(401);
    expect(await h.db.all(`SELECT 1 FROM session`)).toEqual([]);
  });

  // The 403 cases for a missing / untrusted Origin are in auth-allowlist.test.ts (under
  // NODE_ENV=test, where Better Auth would skip the check unless forced on) and in
  // auth-origin.test.ts (NODE_ENV=development, as on a server).

  it("logging out one session leaves another session of the same user valid", async () => {
    const alex = await h.register("alex.dev");
    const second = cookieFrom(await login({ username: "alex.dev", password: PASSWORD }));
    expect((await logout(alex.cookie)).status).toBe(200);
    expect((await me(alex.cookie)).status).toBe(401);
    expect((await me(second)).status).toBe(200);
  });
});

describe("#2 AC5 GET /api/auth/me", () => {
  it("returns {user:{id, username}} for a valid session", async () => {
    const alex = await h.register("alex.dev");
    const res = await me(alex.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: alex.id, username: "alex.dev" } });
  });

  it.each([
    ["no cookie", undefined],
    ["garbage cookie", "better-auth.session_token=not-a-real-token"],
    ["empty cookie value", "better-auth.session_token="],
  ])("answers 401 with %s", async (_l, cookie) => {
    const res = await me(cookie);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("answers 401 for a tampered (re-signed-looking) cookie of a real session", async () => {
    const alex = await h.register("alex.dev");
    const tampered = alex.cookie.replace(/session_token=([^;.]+)/, "session_token=$1x");
    expect(tampered).not.toBe(alex.cookie);
    expect((await me(tampered)).status).toBe(401);
  });
});

describe("#2 AC6 data routes require a session", () => {
  const routes: [string, string, unknown?][] = [
    ["GET", "/api/groups"],
    ["POST", "/api/groups", { name: "Test Crew" }],
    ["GET", "/api/quotes?group=1"],
    ["POST", "/api/quotes", { group_id: 1, text: "synthetic quote 1" }],
    ["GET", "/api/quotes/1"],
    ["PUT", "/api/quotes/1", { text: "synthetic quote 1" }],
    ["DELETE", "/api/quotes/1"],
    ["GET", "/api/users?q=alex"],
    ["POST", "/api/groups/1/invites", { username: "alex.dev" }],
    ["GET", "/api/invites"],
    ["POST", "/api/invites/1/accept"],
    ["POST", "/api/invites/1/decline"],
    // Malformed input must not be validated before authentication.
    ["GET", "/api/quotes"],
    ["PUT", "/api/quotes/abc"],
  ];

  it.each(routes)("%s %s answers 401 without a session", async (method, path, body) => {
    const res = await h.req(method, path, { body });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("no data was written by unauthenticated requests", async () => {
    for (const [method, path, body] of routes) await h.req(method, path, { body });
    expect(await h.db.all("SELECT 1 FROM groups")).toEqual([]);
    expect(await h.db.all("SELECT 1 FROM quotes")).toEqual([]);
  });
});

describe("#2 raw Better Auth sign-up / sign-in endpoints are blocked", () => {
  it.each([
    "/api/auth/sign-up/email",
    "/api/auth/sign-in/email",
    "/api/auth/sign-in/username",
    "/api/auth/SIGN-UP/email",
    "/api/auth//sign-up/email",
    "/api/auth/sign-in/social",
    "/api/auth/sign-in/anonymous",
  ])("POST %s answers 404 and creates nothing", async (path) => {
    const res = await h.req("POST", path, {
      headers: { origin: ORIGIN },
      body: {
        name: "sam.dev",
        email: "sam.dev@example.org",
        username: "SAM-DEV-BYPASS",
        password: PASSWORD,
      },
    });
    expect(res.status).toBe(404);
    expect(await userCount()).toBe(0);
  });

  it.each(["/api/auth/sign%2Dup/email", "/api/auth/%73ign-up/email"])(
    "POST %s (percent-encoded path) does not create a user",
    async (path) => {
      const res = await h.req("POST", path, {
        headers: { origin: ORIGIN },
        body: { name: "sam", email: "sam.dev@example.org", username: "SAM-DEV", password: PASSWORD },
      });
      expect(res.status).not.toBe(200);
      expect(await userCount()).toBe(0);
    },
  );

  it("POST /api/auth/sign-in/email cannot log in an existing user", async () => {
    await h.register("alex.dev");
    const [{ email }] = await h.db.all<{ email: string }>(`SELECT email FROM "user"`);
    const res = await h.req("POST", "/api/auth/sign-in/email", {
      headers: { origin: ORIGIN },
      body: { email, password: PASSWORD },
    });
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("#2 AC7 migrations are numbered, ordered and idempotent", () => {
  it("records every api/migrations file in schema_migrations, in order", async () => {
    const rows = await h.db.all<{ name: string }>("SELECT name FROM schema_migrations ORDER BY rowid");
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort());
    expect(names).toEqual(
      expect.arrayContaining([
        "0001_init.sql",
        "0002_auth.sql",
        "0003_groups_membership.sql",
        "0004_group_invites.sql",
      ]),
    );
    for (const t of ["user", "session", "account", "verification"]) {
      expect(
        await h.db.all("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", t),
      ).toHaveLength(1);
    }
  });

  it("re-running migrate() on the same connection is a no-op and keeps data", async () => {
    const alex = await h.register("alex.dev");
    await h.createGroup(alex, "Test Crew");
    const before = await h.db.all("SELECT name, applied_at FROM schema_migrations ORDER BY name");
    expect(() => migrate(h.db.sqlite)).not.toThrow();
    expect(await h.db.all("SELECT name, applied_at FROM schema_migrations ORDER BY name")).toEqual(before);
    expect((await h.as(alex).get("/api/groups")).status).toBe(200);
    expect(await userCount()).toBe(1);
  });

  // No file on disk (rules/tests.md §4): a named shared-cache in-memory database lets a second
  // nodeDb() connection open the same, already migrated database. It lives while one connection
  // is open, so `first` is closed only after `second` has opened it.
  it("opening nodeDb() a second time on an existing database is a no-op and keeps data", async () => {
    const file = `file:dzingel-reopen-${crypto.randomUUID()}?mode=memory&cache=shared`;

    const first = harness(nodeDb(file));
    const alex = await first.register("alex.dev");
    const g = await first.createGroup(alex, "Test Crew");
    await first.createQuote(alex, g.id, "synthetic quote 1");
    const migrations = await first.db.all("SELECT name, applied_at FROM schema_migrations ORDER BY name");

    const second = harness(nodeDb(file));
    first.db.sqlite.close();
    expect(await second.db.all("SELECT name, applied_at FROM schema_migrations ORDER BY name")).toEqual(
      migrations,
    );
    // Session, user and data survived the reopen.
    expect((await second.as(alex).get("/api/auth/me")).status).toBe(200);
    expect((await second.listQuotes(alex, g.id)).map((q) => q.text)).toEqual(["synthetic quote 1"]);
    second.db.sqlite.close();
  });
});

describe("#2 AC8 secrets and password logging", () => {
  it("createAuth fails clearly when the secret is missing", () => {
    const db = nodeDb(":memory:");
    expect(() => createAuth(db.sqlite, { secret: "" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => createAuth(db.sqlite, { secret: undefined as unknown as string })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("never writes the password to the console during register, login (ok and failed) and logout", async () => {
    const secretPw = "synthetic-unique-pw-7f3a";
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    try {
      await register({ username: "alex.dev", password: secretPw });
      await register({ username: "alex.dev", password: secretPw }); // 409 path
      await register({ username: "Bad Name", password: secretPw }); // 400 path
      const ok = await login({ username: "alex.dev", password: secretPw });
      await login({ username: "alex.dev", password: secretPw + "x" });
      await login({ username: "nobody.here", password: secretPw });
      await logout(cookieFrom(ok));
      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call.map(String))).not.toContain(secretPw);
        }
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
