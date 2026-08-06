# Context Check — GitHub Action

Lint your agent context files (`AGENTS.md`, `CLAUDE.md`) against the real
repository on every pull request, and get a single, self-updating comment with
the findings.

It also flags the case this tool exists for: **a PR that changes a manifest
(`package.json`, `pyproject.toml`, `Makefile`, …) but doesn't touch any context
file** — the moment your agent's instructions quietly go stale.

## Usage

Add `.github/workflows/contextcheck.yml` to your repo:

```yaml
name: Context Check
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write   # required to post the PR comment

jobs:
  contextcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # so the changed-files diff works
      - uses: jubins/contextcheck/action@v0
```

That's it. On each PR the Action posts (and updates) one comment summarising the
findings.

## Inputs

| Input | Default | Description |
|---|---|---|
| `working-directory` | `.` | Directory to lint. |
| `severity-threshold` | `none` | Fail the check at this level: `error` \| `warn` \| `info` \| `none`. Default `none` (warn-only, never blocks a merge). |
| `version` | `latest` | Version of `contextcheck-cli` to use. |
| `github-token` | `${{ github.token }}` | Token used to post the comment. |
| `sarif-file` | `""` | If set, write SARIF to this path for code-scanning upload. |

## Show findings in "Files Changed" (SARIF)

Set `sarif-file` and upload it, so findings appear inline in the PR's Files
Changed tab via GitHub code scanning:

```yaml
permissions:
  contents: read
  pull-requests: write
  security-events: write   # required to upload SARIF
jobs:
  contextcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: jubins/contextcheck/action@v0
        with:
          sarif-file: contextcheck.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: contextcheck.sarif
```

## Making it a required check

Start with the default (`severity-threshold: none`) so it never blocks merges
while people get used to it. Once the team trusts it, raise the bar:

```yaml
      - uses: jubins/contextcheck/action@v0
        with:
          severity-threshold: error
```

## What it checks

See the [main README](../README.md#what-it-checks) for the full rule list
(`stale-command`, `dead-path`, `case-mismatch-path`, `wrong-package-manager`,
`undocumented-task`).
