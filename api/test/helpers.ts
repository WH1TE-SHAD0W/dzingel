// Shared test harness: a fresh app on an in-memory node:sqlite DB (real migrations) per call,
// plus helpers to register synthetic users and send authenticated requests.
import { expect } from "vitest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";
import { nodeDb, type NodeDb } from "../src/node-db";

export const TEST_SECRET = "test-secret-".padEnd(48, "x");
export const ORIGIN = "http://localhost";
export const PASSWORD = "synthetic-pass-1";

export type App = ReturnType<typeof createApp>;
export type Group = { id: number; name: string };
export type Quote = {
  id: number;
  group_id: number;
  text: string;
  context: string;
  created_at: string;
  author: string | null;
};
export type Invite = {
  id: number;
  group_id: number;
  group_name: string;
  inviter: string | null;
  created_at: string;
};
export type User = { id: string; username: string; cookie: string };

/**
 * Build an app on the given DB (default: fresh `:memory:`). Rate limiting is off by default: the
 * suite creates many sessions per second from one (absent) client IP, and Better Auth's memory
 * store is shared per process. rate-limit.test.ts turns it on explicitly.
 */
export function makeApp(
  db: NodeDb = nodeDb(":memory:"),
  opts: { rateLimit?: boolean } = {},
): { app: App; db: NodeDb } {
  const auth = createAuth(db.sqlite, { secret: TEST_SECRET, rateLimit: opts.rateLimit ?? false });
  return { app: createApp(db, auth), db };
}

/** `name=value` pairs of every Set-Cookie header, joined for a Cookie request header. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export interface Harness {
  app: App;
  db: NodeDb;
  /** JSON request; `cookie` is sent when given. Body is JSON-encoded. */
  req(
    method: string,
    path: string,
    opts?: { cookie?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<Response>;
  /** POST /api/auth/register; asserts 201 and returns the user with its session cookie. */
  register(username: string, password?: string): Promise<User>;
  /**
   * Authenticated client bound to a user's cookie. `post` sends `{}` when no body is given: every
   * mutating route requires an application/json object body (e.g. invite accept/decline).
   */
  as(user: User | string): {
    get(path: string): Promise<Response>;
    post(path: string, body?: unknown): Promise<Response>;
    put(path: string, body?: unknown): Promise<Response>;
    del(path: string): Promise<Response>;
  };
  createGroup(user: User, name?: string): Promise<Group>;
  createQuote(user: User, group_id: number, text: string, context?: string): Promise<{ id: number }>;
  listQuotes(user: User, group: number, q?: string): Promise<Quote[]>;
  /** Invite `invitee` to `group` as `inviter` and have the invitee accept. */
  addMember(inviter: User, group: number, invitee: User): Promise<void>;
}

export function harness(db?: NodeDb, opts: { rateLimit?: boolean } = {}): Harness {
  const { app, db: d } = makeApp(db, opts);

  const req: Harness["req"] = async (method, path, opts = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
    if (opts.cookie) headers.cookie = opts.cookie;
    return app.request(path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  };

  const register: Harness["register"] = async (username, password = PASSWORD) => {
    const res = await req("POST", "/api/auth/register", { body: { username, password, acceptTerms: true } });
    expect(res.status, `register ${username}`).toBe(201);
    const { user } = (await res.json()) as { user: { id: string; username: string } };
    const cookie = cookieFrom(res);
    expect(cookie).toMatch(/session_token=/);
    return { ...user, cookie };
  };

  const as: Harness["as"] = (user) => {
    const cookie = typeof user === "string" ? user : user.cookie;
    return {
      get: (path) => req("GET", path, { cookie }),
      post: (path, body = {}) => req("POST", path, { cookie, body }),
      put: (path, body) => req("PUT", path, { cookie, body }),
      del: (path) => req("DELETE", path, { cookie }),
    };
  };

  const createGroup: Harness["createGroup"] = async (user, name = "Test Crew") => {
    const res = await as(user).post("/api/groups", { name });
    expect(res.status).toBe(201);
    return (await res.json()) as Group;
  };

  const createQuote: Harness["createQuote"] = async (user, group_id, text, context) => {
    const res = await as(user).post("/api/quotes", { group_id, text, context });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: number };
  };

  const listQuotes: Harness["listQuotes"] = async (user, group, q) => {
    const qs = new URLSearchParams({ group: String(group) });
    if (q !== undefined) qs.set("q", q);
    const res = await as(user).get(`/api/quotes?${qs}`);
    expect(res.status).toBe(200);
    return (await res.json()) as Quote[];
  };

  const addMember: Harness["addMember"] = async (inviter, group, invitee) => {
    const inv = await as(inviter).post(`/api/groups/${group}/invites`, { username: invitee.username });
    expect(inv.status).toBe(201);
    const { id } = (await inv.json()) as { id: number };
    const acc = await as(invitee).post(`/api/invites/${id}/accept`);
    expect(acc.status).toBe(200);
  };

  return { app, db: d, req, register, as, createGroup, createQuote, listQuotes, addMember };
}
