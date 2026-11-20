// DOM-free parts of the web client (#6-#10): the typed API client and quote-form constants.
// Page scripts (register.ts, login.ts, quote-*.ts) touch the DOM at import time and are not
// covered here.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  genericMessage,
  isStatus,
  login,
  logout,
  register,
} from "../src/lib/api";
import { CONTEXT_MAX, formatDate, TEXT_MAX } from "../src/lib/quote-form";

type Call = { url: string; init: RequestInit };

/** Stub fetch with one canned response; returns the recorded calls. */
function stubFetch(status: number, body: unknown, raw?: string): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(raw ?? JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("#9 #10 quote form limits mirror the API", () => {
  it("text max 1000, context max 2000 (api/src/app.ts)", () => {
    expect(TEXT_MAX).toBe(1000);
    expect(CONTEXT_MAX).toBe(2000);
  });
});

describe("#10 formatDate (Added by … on <date>)", () => {
  it("formats a SQLite CURRENT_TIMESTAMP as a UTC-based local date", () => {
    const expected = new Date("2026-03-04T12:00:00Z").toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    expect(formatDate("2026-03-04 12:00:00")).toBe(expected);
  });

  it("falls back to the first 10 chars for an unparseable value", () => {
    expect(formatDate("not-a-date-at-all")).toBe("not-a-date");
    expect(formatDate("")).toBe("");
  });
});

describe("#6 #7 #8 API client: requests match the API contract", () => {
  it("GET sends no body and no content-type, same-origin credentials, /api prefix", async () => {
    const calls = stubFetch(200, [{ id: 1, name: "Test Crew" }]);
    const data = await api<{ id: number }[]>("/groups");
    expect(data).toEqual([{ id: 1, name: "Test Crew" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/groups");
    expect(calls[0].init).toMatchObject({ method: "GET", credentials: "same-origin" });
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].init.headers).toBeUndefined();
  });

  it.each(["POST", "PUT"] as const)(
    "%s always sends application/json with a JSON body (even when body is omitted)",
    async (method) => {
      const calls = stubFetch(200, { ok: true });
      await api("/x", method);
      expect(calls[0].init.headers).toEqual({ "content-type": "application/json" });
      expect(calls[0].init.body).toBe("{}");
    },
  );

  it("DELETE sends no body", async () => {
    const calls = stubFetch(200, { ok: true });
    await api("/quotes/1", "DELETE");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("login / register / logout hit the wrapper endpoints with JSON", async () => {
    const calls = stubFetch(200, { user: { id: "u1", username: "alex.dev" } });
    expect(await login("alex.dev", "synthetic-pass-1")).toEqual({ id: "u1", username: "alex.dev" });
    expect(await register("alex.dev", "synthetic-pass-1")).toEqual({ id: "u1", username: "alex.dev" });
    await logout();
    expect(calls.map((c) => [c.url, c.init.method])).toEqual([
      ["/api/auth/login", "POST"],
      ["/api/auth/register", "POST"],
      ["/api/auth/logout", "POST"],
    ]);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      username: "alex.dev",
      password: "synthetic-pass-1",
    });
    // Never the raw Better Auth endpoints (they answer 404).
    expect(calls.some((c) => /sign-(in|up)/.test(c.url))).toBe(false);
  });
});

describe("#6 #7 #10 API client: error mapping", () => {
  it("non-2xx throws ApiError with status and parsed body (e.g. 409 username taken)", async () => {
    stubFetch(409, { error: "username taken", fields: { username: "is already taken" } });
    const err = await api("/auth/register", "POST", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isStatus(err, 409)).toBe(true);
    expect(isStatus(err, 400)).toBe(false);
    expect((err as ApiError).body.fields).toEqual({ username: "is already taken" });
    expect((err as ApiError).message).toBe("username taken");
  });

  it("404 from GET /quotes/:id is recognisable (edit page not-found state)", async () => {
    stubFetch(404, { error: "not found" });
    const err = await api("/quotes/99999").catch((e: unknown) => e);
    expect(isStatus(err, 404)).toBe(true);
  });

  it("a non-JSON error body yields ApiError with an empty body", async () => {
    stubFetch(500, null, "<html>oops</html>");
    const err = (await api("/groups").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(500);
    expect(err.body).toEqual({});
    expect(err.message).toBe("request failed (500)");
  });

  it("a network failure throws ApiError status 0", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await api("/groups").catch((e: unknown) => e);
    expect(isStatus(err, 0)).toBe(true);
  });

  it("isStatus is false for non-ApiError values", () => {
    expect(isStatus(new Error("x"), 404)).toBe(false);
    expect(isStatus({ status: 404 }, 404)).toBe(false);
    expect(isStatus(undefined, 404)).toBe(false);
  });

  it("genericMessage: plain-language text for offline, 429 and anything else", () => {
    expect(genericMessage(new ApiError(0, {}))).toMatch(/could not reach the server/i);
    expect(genericMessage(new ApiError(429, {}))).toMatch(/too many attempts/i);
    expect(genericMessage(new ApiError(500, {}))).toBe("Something went wrong. Please try again.");
    expect(genericMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
    // Never echoes server error text to the user.
    expect(genericMessage(new ApiError(500, { error: "internal SQL detail" }))).not.toMatch(/SQL/);
  });
});
