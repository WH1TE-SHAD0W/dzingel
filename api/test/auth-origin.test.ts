// #2 AC4 logout CSRF guard. Better Auth disables its origin check when NODE_ENV === "test" or
// TEST is truthy (both set by Vitest), reading NODE_ENV once at module load. This file resets
// both before any import so the check behaves as in a deployed server.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NODE_ENV = "development";
  delete process.env.TEST;
});

import { harness, ORIGIN, type Harness, type User } from "./helpers";

let h: Harness;
let alex: User;

beforeEach(async () => {
  h = harness();
  alex = await h.register("alex.dev");
  // Better Auth logs a "Base URL is not set" warning per request in this mode; keep output clean.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const logout = (headers: Record<string, string>) =>
  h.req("POST", "/api/auth/logout", { cookie: alex.cookie, body: {}, headers });
const me = () => h.req("GET", "/api/auth/me", { cookie: alex.cookie });

describe("#2 AC4 logout requires a trusted Origin (cookie-bearing auth POST)", () => {
  it("runs with Better Auth's origin check active (NODE_ENV is not 'test')", () => {
    expect(process.env.NODE_ENV).not.toBe("test");
    expect(process.env.TEST).toBeUndefined();
  });

  it("with the app's own Origin: 200 and the session ends", async () => {
    const res = await logout({ origin: ORIGIN });
    expect(res.status).toBe(200);
    expect((await me()).status).toBe(401);
  });

  it("without an Origin header: 403 and the session stays valid", async () => {
    const res = await logout({});
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect((await me()).status).toBe(200);
  });

  it("from an untrusted Origin: 403 and the session stays valid", async () => {
    const res = await logout({ origin: "https://evil.example.org" });
    expect(res.status).toBe(403);
    expect((await me()).status).toBe(200);
  });

  it("from a look-alike Origin (suffix / different port): 403", async () => {
    for (const origin of ["http://localhost.evil.example.org", "http://localhost:4321", "null"]) {
      const res = await logout({ origin });
      expect(res.status, origin).toBe(403);
    }
    expect((await me()).status).toBe(200);
  });

  it("login and register (no cookie) are not blocked by a missing Origin", async () => {
    const login = await h.req("POST", "/api/auth/login", {
      body: { username: "alex.dev", password: "synthetic-pass-1" },
    });
    expect(login.status).toBe(200);
    const reg = await h.req("POST", "/api/auth/register", {
      body: { username: "sam.dev", password: "synthetic-pass-1" },
    });
    expect(reg.status).toBe(201);
  });
});
