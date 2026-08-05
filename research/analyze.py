#!/usr/bin/env python3
"""Summarize the corpus study CSVs. Pure stdlib — no pandas needed.

Usage: python3 research/analyze.py [out_dir]
"""
import csv
import os
import sys
from collections import Counter
from datetime import datetime, timezone

out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "out")
repos_csv = os.path.join(out_dir, "repos.csv")
findings_csv = os.path.join(out_dir, "findings.csv")


def read_csv(path):
    if not os.path.exists(path):
        sys.exit(f"Not found: {path} — run research/run.mjs first.")
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def to_int(x, default=0):
    try:
        return int(x)
    except (TypeError, ValueError):
        return default


def pct(n, d):
    return f"{(100 * n / d):.1f}%" if d else "n/a"


def histogram(values, buckets):
    counts = Counter()
    for v in values:
        for lo, hi, label in buckets:
            if lo <= v <= hi:
                counts[label] += 1
                break
    return counts


def main():
    repos = read_csv(repos_csv)
    findings = read_csv(findings_csv)
    n = len(repos)
    if n == 0:
        sys.exit("No repos in the corpus.")

    print(f"# Context Check corpus study — {n} repositories\n")

    # Findings per repo.
    per_repo = [to_int(r["findings"]) for r in repos]
    total_findings = sum(per_repo)
    print(f"Total findings: {total_findings}")
    print(f"Mean findings/repo: {total_findings / n:.1f}")
    print(f"Median findings/repo: {sorted(per_repo)[n // 2]}\n")

    # % with at least one error.
    with_error = sum(1 for r in repos if to_int(r["error"]) > 0)
    with_any = sum(1 for r in repos if to_int(r["findings"]) > 0)
    print(f"Repos with >=1 error: {with_error} ({pct(with_error, n)})")
    print(f"Repos with any finding: {with_any} ({pct(with_any, n)})\n")

    # Findings-per-repo distribution.
    print("Findings-per-repo distribution:")
    dist = histogram(
        per_repo,
        [(0, 0, "0"), (1, 2, "1-2"), (3, 5, "3-5"), (6, 10, "6-10"), (11, 10**9, "11+")],
    )
    for label in ["0", "1-2", "3-5", "6-10", "11+"]:
        print(f"  {label:>5}: {dist.get(label, 0)}")
    print()

    # Line-count distribution vs the 150-line threshold.
    lines = [to_int(r["max_lines"]) for r in repos if to_int(r["max_lines"]) > 0]
    over = sum(1 for x in lines if x > 150)
    print(f"Largest context file > 150 lines: {over}/{len(lines)} ({pct(over, len(lines))})\n")

    # Findings by rule.
    by_rule = Counter(f["rule"] for f in findings)
    print("Findings by rule:")
    for rule, count in by_rule.most_common():
        print(f"  {rule:>24}: {count}")
    print()

    # Commit-velocity vs staleness (very rough): repos with a 'staleness'
    # finding grouped by how recently they were pushed.
    stale_repos = {f["slug"] for f in findings if f["rule"] == "staleness"}
    recent, old = 0, 0
    now = datetime.now(timezone.utc)
    for r in repos:
        pushed = r.get("pushed_at")
        if not pushed:
            continue
        try:
            dt = datetime.fromisoformat(pushed.replace("Z", "+00:00"))
        except ValueError:
            continue
        days = (now - dt).days
        if r["slug"] in stale_repos:
            if days < 30:
                recent += 1
            else:
                old += 1
    print("Repos flagged 'staleness', by last push:")
    print(f"  pushed < 30 days ago: {recent}")
    print(f"  pushed >= 30 days ago: {old}")


if __name__ == "__main__":
    main()
