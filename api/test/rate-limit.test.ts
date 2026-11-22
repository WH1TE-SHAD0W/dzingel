// #2 Rate limiting of the auth wrappers (review fix on #11). The rest of the suite builds its apps
// with rate limiting off (helpers.ts); here it is on, as in production.
//
// Better Auth's memory store is module-level, i.e. shared by every app in this process, and keyed
// by client IP + Better Auth path. So every test uses its own X-Forwarded-For addresses
// (documentation ranges 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) and never reuses one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFrom, harness, PASSWORD, type Harness } from "./helpers";

let h: Harness;
beforeEach(() => {
  h = harness(undefined, { rateLimit: true });
});
afterEach(() => {
  vi.useRealTimers();
});

let next = 1;
/** A fresh, never-before-used client IP. */
const ip = () => `203.0.113.${next++}`;

const register = (from: string, username: string) =>
  h.req("POST", "/api/auth/register", {
    body: { username, password: PASSWORD, acceptTerms: true },
    headers: { "x-forwarded-for": from },
  });
const login = (from: string, password = PASSWORD, username = "alex.dev") =>
  h.req("POST", "/api/auth/login", {
    body: { username, password },
    headers: { "x-forwarded-for": from },
  });

describe("#2 rate limiting is on by default (3 sign-ins / sign-ups per 10 s per client IP)", () => {
  beforeEach(async () => {
    expect((await register(ip(), "alex.dev")).status).toBe(201);
  });

  it("4th login from one IP within the window: 429 {error:'too many requests'}, no cookie", async () => {
    const a = ip();
    for (let i = 1; i <= 3; i++) expect((await login(a)).status, `login ${i}`).toBe(200);
    const res = await login(a);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too many requests" });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("another IP is not affected while the first one is limited", async () => {
    const a = ip();
    for (let i = 0; i < 4; i++) await login(a);
    expect((await login(a)).status).toBe(429);
    const res = await login(ip());
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).toMatch(/session_token=/);
  });

  it("failed attempts count too: after 3 wrong passwords the right one is refused (brute force)", async () => {
    const a = ip();
    for (let i = 0; i < 3; i++) expect((await login(a, "wrong-pass-9")).status).toBe(401);
    expect((await login(a)).status).toBe(429);
  });

  it("unknown usernames count too (no user enumeration by hammering)", async () => {
    const a = ip();
    for (let i = 0; i < 3; i++) expect((await login(a, PASSWORD, `nobody.${i}`)).status).toBe(401);
    expect((await login(a)).status).toBe(429);
  });

  it("4th register from one IP within the window: 429, and the 4th user is not created", async () => {
    const a = ip();
    for (let i = 1; i <= 3; i++) expect((await register(a, `sam.dev${i}`)).status).toBe(201);
    const res = await register(a, "sam.dev4");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too many requests" });
    expect(await h.db.all(`SELECT 1 FROM "user" WHERE username = 'sam.dev4'`)).toEqual([]);
  });

  it("login and register have separate buckets", async () => {
    const a = ip();
    for (let i = 1; i <= 3; i++) expect((await register(a, `kim.dev${i}`)).status).toBe(201);
    expect((await register(a, "kim.dev4")).status).toBe(429);
    expect((await login(a)).status).toBe(200);
  });

  it("the limit lifts once the 10 s window has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    const a = ip();
    for (let i = 0; i < 3; i++) await login(a);
    expect((await login(a)).status).toBe(429);
    vi.setSystemTime(Date.now() + 11_000);
    expect((await login(a)).status).toBe(200);
  });

  it("the 429 body has no Better Auth internals (message, retry text)", async () => {
    const a = ip();
    for (let i = 0; i < 3; i++) await login(a);
    const raw = await (await login(a)).text();
    expect(raw).toBe(JSON.stringify({ error: "too many requests" }));
  });
});

describe("#2 rate limiting does not break normal use", () => {
  it("a logged-in user's data requests and logout are not limited by the sign-in rule", async () => {
    const a = ip();
    const res = await register(a, "alex.dev");
    const cookie = cookieFrom(res);
    for (let i = 0; i < 10; i++) {
      const r = await h.req("GET", "/api/auth/me", { cookie, headers: { "x-forwarded-for": a } });
      expect(r.status).toBe(200);
    }
    const out = await h.req("POST", "/api/auth/logout", {
      cookie,
      body: {},
      headers: { "x-forwarded-for": a, origin: "http://localhost" },
    });
    expect(out.status).toBe(200);
  });
});
