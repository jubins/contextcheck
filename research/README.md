# Context Check — corpus study

A harness that runs `contextcheck` across many public repositories and
aggregates the results, to measure how widespread agent-context-file drift
actually is.

**This is research tooling — it is not part of the shipped npm package.**

## What it does

1. Reads a newline-delimited list of GitHub repo URLs (`repos.txt`).
2. For each: shallow-clones to a temp dir, runs `contextcheck --format json`
   (recursively), records the findings, then deletes the clone.
3. Writes two CSVs:
   - `out/repos.csv` — one row per repo (tidy: counts by severity, line count,
     stars, language, days since the context file changed).
   - `out/findings.csv` — one row per finding (long format).
4. Checkpoints progress to `out/checkpoint.json`, so a re-run resumes and
   skips repos already processed.

The clone step is defensive: repos that vanish, are huge, are LFS-heavy, or
time out are skipped and logged — never aborting the run.

## Usage

```bash
# build the CLI first
npm run build

# gather a repo list (e.g. GitHub code search for AGENTS.md), one URL per line:
#   https://github.com/owner/name
node research/run.mjs repos.txt

# then analyze
python3 research/analyze.py
```

### Options (env vars)

| Var | Default | Meaning |
|---|---|---|
| `CONCURRENCY` | `4` | Repos processed in parallel. |
| `CLONE_TIMEOUT_MS` | `60000` | Per-clone timeout. |
| `MAX_REPO_MB` | `500` | Skip repos whose clone exceeds this. |
| `GITHUB_TOKEN` | — | Used for the stars/language/age lookups (raises rate limits). |
| `OUT_DIR` | `research/out` | Where CSVs + checkpoint go. |

## Output

`analyze.py` prints: findings-per-repo distribution, the percentage of repos
with at least one error, the line-count distribution against the 150-line
threshold, and the correlation between commit velocity and staleness.
