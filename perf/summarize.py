"""Gate for the Locust run (issue #21). Reads `<prefix>_stats.csv`, prints a markdown summary and
exits 1 when the failure rate or p95 latency is above the threshold (NFR-03).

Usage: summarize.py <csv-prefix> [--max-p95-ms 100] [--max-failure-pct 0]
Thresholds may also come from PERF_MAX_P95_MS / PERF_MAX_FAILURE_PCT. Memory and CPU are reported
by the workflow and never gate.
"""
import argparse
import csv
import os
import sys


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("prefix")
    p.add_argument("--max-p95-ms", type=float, default=float(os.environ.get("PERF_MAX_P95_MS", 100)))
    p.add_argument("--max-failure-pct", type=float,
                   default=float(os.environ.get("PERF_MAX_FAILURE_PCT", 0)))
    a = p.parse_args(argv)

    with open(f"{a.prefix}_stats.csv", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    total = next((r for r in rows if r["Name"] == "Aggregated"), None)
    if total is None or int(total["Request Count"]) == 0:
        print("No requests were recorded.")
        return 1

    requests_n, failures = int(total["Request Count"]), int(total["Failure Count"])
    fail_pct = 100 * failures / requests_n
    p50, p95 = float(total["50%"]), float(total["95%"])
    problems = []
    if fail_pct > a.max_failure_pct:
        problems.append(f"failure rate {fail_pct:.2f}% > {a.max_failure_pct}%")
    if p95 > a.max_p95_ms:
        problems.append(f"p95 {p95:.0f} ms > {a.max_p95_ms:g} ms")

    print("| Requests | Failures | Failure % | p50 (ms) | p95 (ms) |")
    print("|---:|---:|---:|---:|---:|")
    print(f"| {requests_n} | {failures} | {fail_pct:.2f} | {p50:.0f} | {p95:.0f} |")
    print()
    print("**FAIL**: " + "; ".join(problems) if problems else "**PASS**: within thresholds")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
