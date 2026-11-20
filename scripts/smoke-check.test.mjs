// Tests for scripts/smoke-check.mjs (issue #16, AC3-AC7).
// Uses a stubbed fetchImpl and synthetic URLs only; never touches the network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { main, parseBaseUrl, runSmokeCheck, formatResult } from "./smoke-check.mjs";

const BASE = "https://dzingel.example";
const SENTINEL = "SENTINEL-BODY-synthetic-quote-1-do-not-log";
const SECRET_ERR = "SENTINEL-ERROR-MESSAGE-do-not-log";

/** Build a Response with the sentinel embedded in the body. */
function htmlOk(status = 200) {
  return new Response(`<html><body>${SENTINEL}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
function json401(body = JSON.stringify({ error: "unauthorized", note: SENTINEL })) {
  return new Response(body, { status: 401, headers: { "content-type": "application/json" } });
}

/**
 * Stub fetch. `routes` maps a pathname to a function returning a Response (or throwing).
 * Records every call for later assertions.
 */
function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const handler = routes[url.pathname];
    if (!handler) return new Response(`not found ${SENTINEL}`, { status: 404 });
    return handler(url, init);
  };
  return { fetchImpl, calls };
}

function healthyRoutes(prefix = "") {
  return {
    [`${prefix}/`]: () => htmlOk(),
    [`${prefix}/api/auth/me`]: () => json401(),
  };
}

/** Run main() capturing output. */
async function runMain({ argv = [BASE], env = {}, routes = healthyRoutes(), fetchImpl } = {}) {
  const stub = fetchImpl ? { fetchImpl, calls: [] } : stubFetch(routes);
  const out = [];
  const err = [];
  const code = await main({
    argv,
    env,
    fetchImpl: stub.fetchImpl,
    log: (l) => out.push(String(l)),
    error: (l) => err.push(String(l)),
  });
  return { code, out, err, calls: stub.calls, all: [...out, ...err].join("\n") };
}

describe("#16 AC4/AC5 smoke check: all checks pass", () => {
  it("#16 AC4+AC5: healthy site (GET / 200, /api/auth/me JSON 401) exits 0", async () => {
    const r = await runMain();
    assert.equal(r.code, 0);
    assert.equal(r.err.length, 0);
    assert.match(r.all, /2\/2 checks passed/);
  });

  it("#16 AC5: content type with charset (application/json; charset=UTF-8) is accepted", async () => {
    const r = await runMain({
      routes: {
        "/": () => htmlOk(),
        "/api/auth/me": () =>
          new Response("{}", { status: 401, headers: { "content-type": "application/json; charset=UTF-8" } }),
      },
    });
    assert.equal(r.code, 0);
  });

  it("runSmokeCheck returns one ok result per check", async () => {
    const { fetchImpl } = stubFetch(healthyRoutes());
    const results = await runSmokeCheck(BASE, fetchImpl);
    assert.equal(results.length, 2);
    assert.deepEqual(results.map((x) => [x.path, x.ok, x.status]), [
      ["/", true, 200],
      ["/api/auth/me", true, 401],
    ]);
  });
});

describe("#16 AC4/AC6 smoke check: home page failures", () => {
  for (const status of [500, 404, 503]) {
    it(`#16 AC4+AC6: GET / returning ${status} fails the run (exit 1)`, async () => {
      const r = await runMain({ routes: { ...healthyRoutes(), "/": () => htmlOk(status) } });
      assert.equal(r.code, 1);
      assert.match(r.all, new RegExp(`FAIL .*GET /, status ${status}`));
    });
  }

  it("#16 AC4+AC6: GET / returning 204 (not exactly 200) fails", async () => {
    const r = await runMain({ routes: { ...healthyRoutes(), "/": () => new Response(null, { status: 204 }) } });
    assert.equal(r.code, 1);
    assert.match(r.all, /FAIL .*GET \/, status 204/);
  });
});

describe("#16 AC5/AC6 smoke check: /api/auth/me failures", () => {
  it("#16 AC5+AC6: /api/auth/me returning 200 fails (session leak / wrong route)", async () => {
    const r = await runMain({
      routes: {
        "/": () => htmlOk(),
        "/api/auth/me": () =>
          new Response(JSON.stringify({ user: SENTINEL }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      },
    });
    assert.equal(r.code, 1);
    assert.match(r.all, /FAIL .*\/api\/auth\/me, status 200\): expected status 401/);
  });

  it("#16 AC5+AC6: /api/auth/me 401 with HTML content type fails (binding not reached)", async () => {
    const r = await runMain({
      routes: {
        "/": () => htmlOk(),
        "/api/auth/me": () =>
          new Response(`<html>${SENTINEL}</html>`, { status: 401, headers: { "content-type": "text/html" } }),
      },
    });
    assert.equal(r.code, 1);
    assert.match(r.all, /expected a JSON content type/);
  });

  it("#16 AC5+AC6: /api/auth/me 401 with missing content type fails", async () => {
    const r = await runMain({
      routes: {
        "/": () => htmlOk(),
        "/api/auth/me": () => {
          const res = new Response(new Blob([SENTINEL]), { status: 401 });
          return res;
        },
      },
    });
    assert.equal(r.code, 1);
  });

  it("#16 AC5+AC6: /api/auth/me 401 JSON content type but invalid JSON body fails", async () => {
    const r = await runMain({ routes: { "/": () => htmlOk(), "/api/auth/me": () => json401(`{not json ${SENTINEL}`) } });
    assert.equal(r.code, 1);
    assert.match(r.all, /body is not valid JSON/);
  });

  it("#16 AC5+AC6: /api/auth/me 401 JSON content type with empty body fails", async () => {
    const r = await runMain({ routes: { "/": () => htmlOk(), "/api/auth/me": () => json401("") } });
    assert.equal(r.code, 1);
  });

  it("#16 AC6: both checks failing reports 0/2 and exit 1", async () => {
    const r = await runMain({ routes: {} });
    assert.equal(r.code, 1);
    assert.match(r.all, /0\/2 checks passed/);
  });
});

describe("#16 AC6 smoke check: redirects count as failure", () => {
  for (const status of [301, 302, 307, 308]) {
    it(`#16 AC6: GET / answering ${status} redirect fails`, async () => {
      const r = await runMain({
        routes: {
          ...healthyRoutes(),
          "/": () => new Response(null, { status, headers: { location: "https://elsewhere.example/" } }),
        },
      });
      assert.equal(r.code, 1);
    });
  }

  it("#16 AC6: /api/auth/me answering 302 to a login page fails", async () => {
    const r = await runMain({
      routes: {
        "/": () => htmlOk(),
        "/api/auth/me": () => new Response(null, { status: 302, headers: { location: "/login" } }),
      },
    });
    assert.equal(r.code, 1);
  });

  it("#16 AC6: opaqueredirect-style response (status 0) fails", async () => {
    // Browser-like runtimes return an opaque redirect with status 0 for redirect:"manual".
    const fake = { status: 0, headers: new Headers(), body: null, json: async () => ({}) };
    const r = await runMain({ fetchImpl: async () => fake });
    assert.equal(r.code, 1);
  });
});

describe("#16 AC6/AC7 smoke check: network errors", () => {
  it("#16 AC6+AC7: fetch throwing exits 1 and does not leak the error message", async () => {
    const r = await runMain({
      fetchImpl: async () => {
        throw new TypeError(`fetch failed: ${SECRET_ERR}`);
      },
    });
    assert.equal(r.code, 1);
    assert.ok(!r.all.includes(SECRET_ERR), "error message leaked into output");
    assert.match(r.all, /request failed/);
    assert.match(r.all, /no response/);
  });

  it("#16 AC6+AC7: timeout (TimeoutError) exits 1 with a fixed reason", async () => {
    const r = await runMain({
      fetchImpl: async () => {
        throw new DOMException(SECRET_ERR, "TimeoutError");
      },
    });
    assert.equal(r.code, 1);
    assert.match(r.all, /request timed out/);
    assert.ok(!r.all.includes(SECRET_ERR));
  });

  it("#16 AC6: a body that errors while being read as JSON fails without throwing", async () => {
    const stream = new ReadableStream({
      pull(c) {
        c.error(new Error(SECRET_ERR));
      },
    });
    const r = await runMain({
      routes: {
        "/": () => htmlOk(),
        "/api/auth/me": () => new Response(stream, { status: 401, headers: { "content-type": "application/json" } }),
      },
    });
    assert.equal(r.code, 1);
    assert.ok(!r.all.includes(SECRET_ERR));
  });

  it("#16 AC6: every request carries an abort signal (timeout configured)", async () => {
    const r = await runMain();
    assert.equal(r.calls.length, 2);
    for (const c of r.calls) assert.ok(c.init.signal instanceof AbortSignal, "missing timeout signal");
  });
});

describe("#16 AC6 smoke check: missing or invalid base URL", () => {
  const noFetch = async () => {
    throw new Error("fetch must not be called");
  };

  it("#16 AC6: no argument and no PUBLIC_URL exits 2 without any request", async () => {
    const r = await runMain({ argv: [], env: {}, fetchImpl: noFetch });
    assert.equal(r.code, 2);
    assert.match(r.err.join("\n"), /no base URL/);
  });

  it("#16 AC6: empty PUBLIC_URL (unset repo variable renders as \"\") exits 2", async () => {
    const r = await runMain({ argv: [], env: { PUBLIC_URL: "" }, fetchImpl: noFetch });
    assert.equal(r.code, 2);
  });

  it("#16 AC6: whitespace-only PUBLIC_URL exits 2", async () => {
    const r = await runMain({ argv: [], env: { PUBLIC_URL: "   " }, fetchImpl: noFetch });
    assert.equal(r.code, 2);
  });

  for (const bad of ["not a url", "dzingel.example", "ftp://dzingel.example", "javascript:alert(1)", "file:///etc/passwd", "/relative/path"]) {
    it(`#16 AC6: invalid/non-http URL ${JSON.stringify(bad)} exits 2 without any request`, async () => {
      const r = await runMain({ argv: [bad], fetchImpl: noFetch });
      assert.equal(r.code, 2);
      assert.match(r.err.join("\n"), /not an absolute http\(s\) URL/);
    });
  }

  it("#16 AC3: PUBLIC_URL from env is used when no argument is given", async () => {
    const r = await runMain({ argv: [], env: { PUBLIC_URL: BASE } });
    assert.equal(r.code, 0);
    assert.equal(r.calls[0].url.origin, BASE);
  });

  it("argument takes precedence over PUBLIC_URL", async () => {
    const r = await runMain({ argv: [BASE], env: { PUBLIC_URL: "https://other.example" } });
    assert.equal(r.code, 0);
    for (const c of r.calls) assert.equal(c.url.origin, BASE);
  });

  it("runSmokeCheck throws TypeError for an invalid base URL", async () => {
    await assert.rejects(() => runSmokeCheck("ftp://dzingel.example", async () => htmlOk()), TypeError);
  });

  it("parseBaseUrl normalises: trailing slash, strips query and hash", () => {
    assert.equal(parseBaseUrl("https://dzingel.example").href, "https://dzingel.example/");
    assert.equal(parseBaseUrl(" https://dzingel.example/app?x=1#h ").href, "https://dzingel.example/app/");
    assert.equal(parseBaseUrl(undefined), null);
    assert.equal(parseBaseUrl(""), null);
  });
});

describe("#16 AC7 smoke check: read-only, no credentials, no bodies logged", () => {
  it("#16 AC7: only GET requests, credentials omit, redirect manual, to exactly / and /api/auth/me", async () => {
    const r = await runMain();
    assert.equal(r.calls.length, 2);
    assert.deepEqual(
      r.calls.map((c) => c.url.pathname),
      ["/", "/api/auth/me"],
    );
    for (const c of r.calls) {
      assert.equal(c.init.method, "GET");
      assert.equal(c.init.credentials, "omit");
      assert.equal(c.init.redirect, "manual");
      assert.equal(c.init.body, undefined);
    }
  });

  it("#16 AC7: no cookie or authorization header is sent", async () => {
    const r = await runMain();
    for (const c of r.calls) {
      const h = new Headers(c.init.headers ?? {});
      assert.equal(h.get("cookie"), null);
      assert.equal(h.get("authorization"), null);
    }
  });

  it("#16 AC7: response bodies never appear in log or error output (pass and fail paths)", async () => {
    const scenarios = [
      healthyRoutes(),
      { "/": () => htmlOk(500), "/api/auth/me": () => json401(`{bad ${SENTINEL}`) },
      {
        "/": () => htmlOk(),
        "/api/auth/me": () =>
          new Response(JSON.stringify({ user: SENTINEL }), { status: 200, headers: { "content-type": "application/json" } }),
      },
      { "/": () => htmlOk(), "/api/auth/me": () => new Response(SENTINEL, { status: 401, headers: { "content-type": "text/html" } }) },
      {},
    ];
    for (const routes of scenarios) {
      const r = await runMain({ routes });
      assert.ok(!r.all.includes(SENTINEL), `body leaked into output:\n${r.all}`);
      assert.ok(!r.all.includes("synthetic-quote"), "body fragment leaked");
    }
  });

  it("#16 AC7: formatResult prints only name, path, status and reason", () => {
    const line = formatResult({ name: "n", path: "/p", ok: false, status: 500, reason: "expected status 200" });
    assert.equal(line, "FAIL  n (GET /p, status 500): expected status 200");
  });
});

describe("#16 smoke check: base URL path prefix", () => {
  it("#16: path prefix in base URL is kept for both checks", async () => {
    const r = await runMain({ argv: [`${BASE}/prefix`], routes: healthyRoutes("/prefix") });
    assert.equal(r.code, 0);
    assert.deepEqual(
      r.calls.map((c) => c.url.pathname),
      ["/prefix/", "/prefix/api/auth/me"],
    );
  });

  it("#16: path prefix with trailing slash behaves the same", async () => {
    const r = await runMain({ argv: [`${BASE}/prefix/`], routes: healthyRoutes("/prefix") });
    assert.equal(r.code, 0);
  });

  it("#16: query string in base URL is not forwarded to checks", async () => {
    const r = await runMain({ argv: [`${BASE}/?token=abc`] });
    assert.equal(r.code, 0);
    for (const c of r.calls) assert.equal(c.url.search, "");
  });
});
