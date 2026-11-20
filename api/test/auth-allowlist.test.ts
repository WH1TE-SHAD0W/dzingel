// #2 / #5 review fixes on #11: the raw Better Auth router is not reachable (allowlist of four
// wrappers), invite answers need a JSON body, logins are case-sensitive, and the origin check stays
// on under Vitest (NODE_ENV=test).
import { beforeEach, describe, expect, it } from "vitest";
import { cookieFrom, harness, ORIGIN, PASSWORD, type Harness, type User } from "./helpers";

let h: Harness;
let alex: User;
beforeEach(async () => {
  h = harness();
  alex = await h.register("alex.dev");
});

const userCount = async () =>
  ((await h.db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM "user"`))[0]).n;
const sessionCount = async () =>
  ((await h.db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM session`))[0]).n;

// Every one of these would do something (or leak something) if it reached Better Auth.
const BLOCKED = [
  "/api/auth/get-session",
  "/api/auth/list-sessions",
  "/api/auth/update-user",
  "/api/auth/is-username-available",
  "/api/auth/change-password",
  "/api/auth/sign-out",
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/email",
  "/api/auth/sign-in/username",
  "/api/auth/sign-in/social",
  "/api/auth/revoke-session",
  "/api/auth/revoke-sessions",
  "/api/auth/revoke-other-sessions",
  "/api/auth/delete-user",
  "/api/auth/change-email",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/send-verification-email",
  "/api/auth/verify-email",
  "/api/auth/list-accounts",
  "/api/auth/ok",
  "/api/auth/error",
  "/api/auth/",
  "/api/auth",
];

describe("#2 raw Better Auth endpoints are not reachable (allowlist)", () => {
  // Body that would be accepted by several of the endpoints above.
  const body = {
    name: "Mallory",
    username: "mallory.dev",
    newUsername: "mallory.dev",
    email: "alex.dev@example.org",
    newEmail: "alex.dev@example.org",
    password: PASSWORD,
    currentPassword: PASSWORD,
    newPassword: "synthetic-pass-2",
    revokeOtherSessions: true,
    token: "x",
  };

  it.each(BLOCKED)("GET %s with a valid session and Origin: 404 {error:'not found'}", async (path) => {
    const res = await h.req("GET", path, { cookie: alex.cookie, headers: { origin: ORIGIN } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it.each(BLOCKED)("POST %s with a valid session and Origin: 404 and changes nothing", async (path) => {
    const res = await h.req("POST", path, { cookie: alex.cookie, body, headers: { origin: ORIGIN } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
    expect(res.headers.getSetCookie()).toEqual([]);
    // Nothing happened: same users, same session, same name/username/password.
    expect(await userCount()).toBe(1);
    expect(await sessionCount()).toBe(1);
    expect(await h.db.all(`SELECT name, username FROM "user"`)).toEqual([
      { name: "alex.dev", username: "alex.dev" },
    ]);
    expect((await h.req("GET", "/api/auth/me", { cookie: alex.cookie })).status).toBe(200);
    const relogin = await h.req("POST", "/api/auth/login", {
      body: { username: "alex.dev", password: PASSWORD },
    });
    expect(relogin.status).toBe(200);
  });

  it.each(["PUT", "PATCH", "DELETE"])("%s /api/auth/get-session: 404", async (method) => {
    const res = await h.req(method, "/api/auth/get-session", { cookie: alex.cookie, body: {} });
    expect(res.status).toBe(404);
  });

  it.each(["/api/auth/get-session", "/api/auth/list-sessions"])(
    "GET %s does not leak the session token, ipAddress or userAgent",
    async (path) => {
      const token = alex.cookie.match(/session_token=([^;.]+)/)?.[1];
      expect(token).toBeTruthy();
      const res = await h.req("GET", path, {
        cookie: alex.cookie,
        headers: { origin: ORIGIN, "x-forwarded-for": "198.51.100.77", "user-agent": "synthetic-agent/1" },
      });
      const raw = await res.text();
      expect(raw).not.toContain(token!);
      expect(raw).not.toMatch(/token|ipAddress|userAgent|198\.51\.100\.77|synthetic-agent|expiresAt/i);
    },
  );

  it.each([
    ["GET", "/api/auth/register"],
    ["GET", "/api/auth/login"],
    ["GET", "/api/auth/logout"],
    ["POST", "/api/auth/me"],
    ["PUT", "/api/auth/me"],
  ])("a wrapper with the wrong method (%s %s): 404", async (method, path) => {
    const res = await h.req(method, path, { cookie: alex.cookie, body: method === "GET" ? undefined : {} });
    expect(res.status).toBe(404);
  });

  it.each(["/api/auth/register/", "/api/auth/LOGIN", "/api/auth/me/../get-session"])(
    "path variants around the wrappers (%s) do not reach Better Auth",
    async (path) => {
      const res = await h.req("GET", path, { cookie: alex.cookie });
      expect(res.status).not.toBe(200);
      const raw = await res.text();
      expect(raw).not.toMatch(/token|ipAddress/i);
    },
  );
});

describe("#5 accept/decline require an application/json object body", () => {
  let sam: User;
  let inviteId: number;
  beforeEach(async () => {
    sam = await h.register("sam.dev");
    const g = await h.createGroup(alex, "Test Crew");
    const res = await h.as(alex).post(`/api/groups/${g.id}/invites`, { username: "sam.dev" });
    inviteId = ((await res.json()) as { id: number }).id;
  });

  const status = async () =>
    (await h.db.all<{ status: string }>("SELECT status FROM group_invites WHERE id = ?", inviteId))[0]
      .status;

  const raw = (action: string, headers: Record<string, string>, body?: string) =>
    h.app.request(`/api/invites/${inviteId}/${action}`, {
      method: "POST",
      headers: { cookie: sam.cookie, ...headers },
      body,
    });

  describe.each(["accept", "decline"])("%s", (action) => {
    it.each([
      ["no content-type and no body", {}, undefined],
      ["application/json with no body", { "content-type": "application/json" }, undefined],
      ["application/json with an empty string", { "content-type": "application/json" }, ""],
      ["malformed JSON", { "content-type": "application/json" }, "{nope"],
      ["JSON null", { "content-type": "application/json" }, "null"],
      ["JSON string", { "content-type": "application/json" }, '"yes"'],
      ["JSON number", { "content-type": "application/json" }, "1"],
      ["text/plain with {}", { "content-type": "text/plain" }, "{}"],
      ["form-urlencoded (cross-site form)", { "content-type": "application/x-www-form-urlencoded" }, "a=1"],
      ["multipart/form-data", { "content-type": "multipart/form-data; boundary=x" }, "--x--"],
    ])("%s: 400 and the invite stays pending", async (_l, headers, body) => {
      const res = await raw(action, headers, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid input" });
      expect(await status()).toBe("pending");
    });

    it("application/json {} still works afterwards", async () => {
      expect((await raw(action, {}, undefined)).status).toBe(400);
      const res = await raw(action, { "content-type": "application/json" }, "{}");
      expect(res.status).toBe(200);
      expect(await status()).toBe(action === "accept" ? "accepted" : "declined");
    });

    it("content-type with charset is accepted", async () => {
      const res = await raw(action, { "content-type": "application/json; charset=utf-8" }, "{}");
      expect(res.status).toBe(200);
    });
  });

  it("without a session the body check does not run first: 401", async () => {
    const res = await h.app.request(`/api/invites/${inviteId}/accept`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("#2 login is case-sensitive (usernames are lowercase)", () => {
  it.each(["Alex.Dev", "ALEX.DEV", "alex.deV"])("login as %j: 401 invalid credentials, no cookie", async (username) => {
    const res = await h.req("POST", "/api/auth/login", { body: { username, password: PASSWORD } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid credentials" });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it.each([" alex.dev", "alex.dev ", "alex.dev\n"])("login as %j (surrounding whitespace): 401", async (username) => {
    const res = await h.req("POST", "/api/auth/login", { body: { username, password: PASSWORD } });
    expect(res.status).toBe(401);
  });

  it("the exact lowercase username logs in", async () => {
    const res = await h.req("POST", "/api/auth/login", {
      body: { username: "alex.dev", password: PASSWORD },
    });
    expect(res.status).toBe(200);
  });
});

describe("#2 AC4 the origin check stays on under Vitest (NODE_ENV=test)", () => {
  it("precondition: this suite runs with NODE_ENV=test", () => {
    // Better Auth would skip its origin/CSRF check here if the app did not force it on.
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("logout without an Origin header: 403 {error:'forbidden'} and the session stays valid", async () => {
    const res = await h.req("POST", "/api/auth/logout", { cookie: alex.cookie, body: {} });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect((await h.req("GET", "/api/auth/me", { cookie: alex.cookie })).status).toBe(200);
  });

  it("logout from an untrusted Origin: 403", async () => {
    const res = await h.req("POST", "/api/auth/logout", {
      cookie: alex.cookie,
      body: {},
      headers: { origin: "https://evil.example.org" },
    });
    expect(res.status).toBe(403);
    expect((await h.req("GET", "/api/auth/me", { cookie: alex.cookie })).status).toBe(200);
  });

  it("logout with the app's Origin: 200", async () => {
    const res = await h.req("POST", "/api/auth/logout", {
      cookie: alex.cookie,
      body: {},
      headers: { origin: ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).toMatch(/session_token=/);
  });
});
