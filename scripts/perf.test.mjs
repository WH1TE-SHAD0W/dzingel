// Tests for perf/summarize.py (the Locust gate) and a static check of perf/locustfile.py (#21).
// Synthetic CSV fixtures only. Skipped with a reason when no working Python is on PATH.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = join(root, "perf", "summarize.py");

const python = ["python3", "python", "py"].find(
  (c) => spawnSync(c, ["--version"], { encoding: "utf8" }).status === 0,
);
const skip = python ? false : "no working python3/python found on PATH";

const HEADER =
  "Type,Name,Request Count,Failure Count,Median Response Time,Average Response Time,Min Response Time,Max Response Time,Average Content Size,Requests/s,Failures/s,50%,66%,75%,80%,90%,95%,98%,99%,99.9%,99.99%,100%";

function csv(dir, name, { requests = 1000, failures = 0, p50 = 10, p95 = 40 } = {}) {
  const prefix = join(dir, name);
  const row = `,Aggregated,${requests},${failures},${p50},${p50},1,200,100,50,0,${p50},${p50},${p50},${p50},${p95},${p95},${p95},${p95},${p95},${p95},${p95}`;
  writeFileSync(`${prefix}_stats.csv`, `${HEADER}\n${row}\n`);
  return prefix;
}

function run(args, env = {}) {
  const e = { ...process.env, ...env };
  if (!("PERF_MAX_P95_MS" in env)) delete e.PERF_MAX_P95_MS;
  if (!("PERF_MAX_FAILURE_PCT" in env)) delete e.PERF_MAX_FAILURE_PCT;
  return spawnSync(python, [script, ...args], { encoding: "utf8", env: e });
}

describe("#21 perf/summarize.py gate", { skip }, () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "perf-test-")); });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  it("#21 AC4: passes with 0 failures and p95 under 100 ms, prints markdown", () => {
    const r = run([csv(dir, "ok")]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /\| Requests \|/);
    assert.match(r.stdout, /PASS/);
  });

  it("#21 AC4: p95 exactly at the threshold still passes", () => {
    assert.equal(run([csv(dir, "edge", { p95: 100 })]).status, 0);
  });

  it("#21 AC4: failure rate above 0 fails by default", () => {
    const r = run([csv(dir, "fail", { failures: 1 })]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /FAIL/);
    assert.match(r.stdout, /failure rate/);
  });

  it("#21 AC4: p95 above 100 ms fails by default", () => {
    const r = run([csv(dir, "slow", { p95: 101 })]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /p95/);
  });

  it("#21 AC4: lowered threshold via --max-p95-ms fails an otherwise passing run", () => {
    const p = csv(dir, "arg", { p95: 40 });
    assert.equal(run([p]).status, 0);
    assert.equal(run([p, "--max-p95-ms", "30"]).status, 1);
  });

  it("#21 AC4: lowered threshold via PERF_MAX_P95_MS env fails an otherwise passing run", () => {
    const p = csv(dir, "env", { p95: 40 });
    assert.equal(run([p], { PERF_MAX_P95_MS: "30" }).status, 1);
  });

  it("#21 AC4: PERF_MAX_FAILURE_PCT / --max-failure-pct can allow some failures", () => {
    const p = csv(dir, "tol", { requests: 1000, failures: 5 }); // 0.5%
    assert.equal(run([p]).status, 1);
    assert.equal(run([p, "--max-failure-pct", "1"]).status, 0);
    assert.equal(run([p], { PERF_MAX_FAILURE_PCT: "1" }).status, 0);
  });

  it("#21: zero recorded requests fails", () => {
    assert.equal(run([csv(dir, "zero", { requests: 0 })]).status, 1);
  });

  it("#21: a missing stats file exits non-zero with an error", () => {
    const r = run([join(dir, "does-not-exist")]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /FileNotFoundError|No such file/);
  });
});

describe("#21 perf/locustfile.py static checks", () => {
  const src = readFileSync(join(root, "perf", "locustfile.py"), "utf8");

  it("#21: task weights are 65/20/10/5", () => {
    const weights = [...src.matchAll(/@task\((\d+)\)/g)].map((m) => Number(m[1]));
    assert.deepEqual(weights, [65, 20, 10, 5]);
  });

  it('#21: seeds the group "Test Crew"', () => {
    assert.match(src, /GROUP_NAME\s*=\s*"Test Crew"/);
  });
});
