# Performance test

Source: #21, NFR-01, NFR-02, NFR-03 (`context/requirements.md`), `context/testing-strategy.md`,
ADR 0008. Files: `perf/locustfile.py`, `perf/summarize.py`, `.github/workflows/perf.yml`.

## What the test does

A [Locust](https://locust.io) load test against a throwaway local API (Node, `node:sqlite`, a
temporary SQLite file). It never targets the live Cloudflare site.

- **One synthetic user** `alex.dev`, registered once in `test_start` (or logged in if it already
  exists), member of the group "Test Crew" with a few synthetic quotes. All simulated users reuse
  that session cookie, so the rate-limited register/login endpoints are hit at most twice per run.
  Quote text is synthetic and never logged.
- **Request mix** (task weights):

  | Share | Request |
  |---:|---|
  | 65 % | `GET /api/quotes?group=<id>&q=<keyword>` (search) |
  | 20 % | `GET /api/quotes/:id` (single read) |
  | 10 % | `POST /api/quotes` (create; a non-201 reply counts as a failure) |
  | 5 % | `GET /api/groups` |

- **Load:** 50 users, each waiting 1 s between requests, so about 50 req/s. Run time 30 s.

## Gates

`perf/summarize.py` reads Locust's `<prefix>_stats.csv`, prints a markdown table and exits 1 when:

- the failure rate is above 0 %, or
- p95 latency is above 100 ms (NFR-03).

Thresholds can be changed with `--max-p95-ms`, `--max-failure-pct` or the environment variables
`PERF_MAX_P95_MS`, `PERF_MAX_FAILURE_PCT`. **Memory and CPU are reported only and never gate**
(runner numbers are noisy; #21 AC5). The workflow reports peak RSS (`VmHWM`) and CPU as a share of
one core over the run.

## Run locally (PowerShell)

Needs Python 3 with Locust (CI pins `locust==2.47.0`) and Node 24+.

```powershell
pip install locust==2.47.0
npm install
$env:BETTER_AUTH_SECRET = "<at least 32 random characters>"
$env:DB_FILE = "$env:TEMP\perf.sqlite"
$env:PORT = "8787"
# terminal 1
cd api; node --import tsx src/server.ts
# terminal 2, from the repo root
locust -f perf/locustfile.py --headless -u 50 -r 50 --run-time 30s --host http://localhost:8787 --csv "$env:TEMP\perf"
python perf/summarize.py "$env:TEMP\perf"
```

Use a fresh `DB_FILE` per run (delete the old file by hand) so numbers are comparable. For memory and
CPU, watch the `node` process in Task Manager or `Get-Process`; the script does not measure them
locally.

## CI

Workflow `.github/workflows/perf.yml` ("Perf", job "Locust load test") runs on every pull request,
on push to `main` and on `workflow_dispatch`. It installs Node 24 and Python 3.12, starts the API
with a `BETTER_AUTH_SECRET` generated on the runner (`openssl rand -base64 32`) and a temp SQLite
file, runs Locust, writes the summary and stops the API.

**Results appear in** the job summary of the run (table, CPU, peak memory) and in the workflow
artifact **`locust-results`** (the Locust `perf_*.csv` files).

**No secrets, no Cloudflare, no deploy** (`permissions: contents: read`; ADR 0008, #21 AC8).

### Non-blocking now, required later

The job has `continue-on-error: true`, so a red Perf run does not fail the PR check. Path to making
it required (a human step, `CLAUDE.md` section 1):

1. Watch several runs on `main` and on PRs and confirm they are stable (no flaky p95 or failures).
2. Remove `continue-on-error: true` from `perf.yml`.
3. Add the Perf check to branch protection on `main`.

GitHub runner numbers are noisy (shared hardware), so judge stability over several runs, not one.

## Baseline (local run, 2026-11-22)

Local run on a 16-core host, same parameters as CI (50 users, about 50 req/s, 30 s). Source: #21 AC9.
Not measured by `documenter`; figures come from the ticket.

| Metric | Measured | Target |
|---|---|---|
| p95 latency | about 5-6 ms at 50 req/s | NFR-03: 100 ms |
| Server memory | 150-185 MB | NFR-01: about 200 MB |
| CPU | about 12 % of one core (about 0.8 % of the 16-core host) | NFR-02: about 4 % |

Latency and memory are within target. CPU depends on how NFR-02 is read.

### OPEN QUESTION: what does "4 % CPU" mean?

NFR-02 says "CPU about 4 % at 50 concurrent connections / 50 req/s" without saying 4 % of what.

- Read as **one core**: 12 % would miss the target.
- Read as **the whole host**: about 0.8 % would pass.

Not resolved here; it needs a human decision on `context/requirements.md`. Until then CPU is only
reported, which matches the rule that it never gates.
