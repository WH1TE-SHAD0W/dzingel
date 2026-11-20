#!/usr/bin/env node
// Post-deploy smoke check for the public džingel site (issue #16, option a).
//
//   node scripts/smoke-check.mjs https://dzingel.example.org
//   PUBLIC_URL=https://dzingel.example.org node scripts/smoke-check.mjs
//
// Sends only synthetic GET requests without cookies; never creates data.
// Logs check names, status codes and failure reasons only, never response bodies.
// Plain Node 24 ESM, no dependencies. Exit code: 0 all checks passed,
// 1 a check failed, 2 missing or invalid base URL.

import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 15_000;

/**
 * Parse and normalise the base URL. Returns a URL whose pathname ends in "/",
 * or null when the input is missing or not an absolute http(s) URL.
 * @param {string | undefined | null} input
 * @returns {URL | null}
 */
export function parseBaseUrl(input) {
  if (typeof input !== "string" || input.trim() === "") return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

/**
 * @typedef {{ name: string, path: string, ok: boolean, status: number | null, reason?: string }} CheckResult
 */

/** @param {Response} res */
async function discardBody(res) {
  try {
    await res.body?.cancel();
  } catch {
    // ignore: the body is never used
  }
}

/** @param {unknown} err */
function errorReason(err) {
  if (err && typeof err === "object" && "name" in err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "request timed out";
  }
  return "request failed";
}

/**
 * Run all smoke checks against `baseUrl`. Never throws for a failed check; every
 * outcome is a result entry.
 * @param {string | URL} baseUrl
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<CheckResult[]>}
 */
export async function runSmokeCheck(baseUrl, fetchImpl = fetch) {
  const base = parseBaseUrl(String(baseUrl));
  if (!base) throw new TypeError("base URL must be an absolute http(s) URL");

  /** @param {string} path */
  const get = (path) =>
    fetchImpl(new URL(path, base), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { accept: path === "" ? "text/html" : "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  /** @type {CheckResult[]} */
  const results = [];

  // 1. The site itself answers.
  {
    const name = "home page returns 200";
    try {
      const res = await get("");
      await discardBody(res);
      results.push(
        res.status === 200
          ? { name, path: "/", ok: true, status: res.status }
          : { name, path: "/", ok: false, status: res.status, reason: "expected status 200" },
      );
    } catch (err) {
      results.push({ name, path: "/", ok: false, status: null, reason: errorReason(err) });
    }
  }

  // 2. The web worker reaches dzingel-api through its service binding:
  //    an anonymous session check must be a JSON 401.
  {
    const name = "anonymous /api/auth/me returns JSON 401";
    const path = "/api/auth/me";
    try {
      const res = await get("api/auth/me");
      const contentType = res.headers.get("content-type") ?? "";
      if (res.status !== 401) {
        await discardBody(res);
        results.push({ name, path, ok: false, status: res.status, reason: "expected status 401" });
      } else if (!contentType.toLowerCase().includes("application/json")) {
        await discardBody(res);
        results.push({ name, path, ok: false, status: res.status, reason: "expected a JSON content type" });
      } else {
        let parsed = true;
        try {
          await res.json(); // parsed only to prove it is JSON; never logged
        } catch {
          parsed = false;
        }
        results.push(
          parsed
            ? { name, path, ok: true, status: res.status }
            : { name, path, ok: false, status: res.status, reason: "body is not valid JSON" },
        );
      }
    } catch (err) {
      results.push({ name, path, ok: false, status: null, reason: errorReason(err) });
    }
  }

  return results;
}

/**
 * One log line per result: name, path, status and reason, never a body.
 * @param {CheckResult} r
 */
export function formatResult(r) {
  const status = r.status === null ? "no response" : `status ${r.status}`;
  return `${r.ok ? "PASS" : "FAIL"}  ${r.name} (GET ${r.path}, ${status})${r.reason ? `: ${r.reason}` : ""}`;
}

/**
 * CLI entry. Base URL comes from the first argument or the PUBLIC_URL env var.
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, fetchImpl?: typeof fetch, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {Promise<number>} process exit code
 */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  error = console.error,
} = {}) {
  const raw = argv[0] ?? env.PUBLIC_URL;
  if (raw === undefined || raw.trim() === "") {
    error("smoke-check: no base URL. Pass it as an argument or set PUBLIC_URL (repo variable vars.PUBLIC_URL in CI).");
    return 2;
  }
  const base = parseBaseUrl(raw);
  if (!base) {
    error("smoke-check: the base URL is not an absolute http(s) URL.");
    return 2;
  }

  log(`smoke-check: ${base.origin}${base.pathname}`);
  const results = await runSmokeCheck(base, fetchImpl);
  for (const r of results) (r.ok ? log : error)(formatResult(r));
  const failed = results.filter((r) => !r.ok).length;
  log(`smoke-check: ${results.length - failed}/${results.length} checks passed`);
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
