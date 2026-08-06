<div align="center">

<img src="https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/icon.png" alt="Context Check" width="96" height="96" />

# Context Check

[![npm](https://img.shields.io/npm/v/contextcheck-cli.svg)](https://www.npmjs.com/package/contextcheck-cli)
[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/jubinsoni.contextcheck.png?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck)
[![CI](https://github.com/jubins/contextcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/jubins/contextcheck/actions/workflows/ci.yml)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/598be8b52d7c4ace9ea63d5401809076)](https://app.codacy.com/gh/jubins/contextcheck/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Keep your AGENTS.md honest — automatically.**

</div>

Context Check lints AI agent context files (`AGENTS.md`, `CLAUDE.md`, and friends)
against your **actual repository** — flagging commands, paths, and casing that have
gone stale. Deterministic, offline, no API keys, no telemetry.

Agent context files drift. You rename an npm script, move a folder, or switch
tools — but the `AGENTS.md` you handed your AI still points at the old world, so
your agent confidently runs commands that no longer exist. Context Check catches
that.

## Install

```bash
npm install -g contextcheck-cli
# or run without installing:
npx contextcheck-cli
```

Installs the `contextcheck` command (`ctxcheck` also works as a short alias).

## Usage

Run it from the root of a repo that has an `AGENTS.md` or `CLAUDE.md`:

```bash
contextcheck                       # check the current directory
contextcheck path/to/dir           # check a specific directory
contextcheck --format json         # machine-readable output
contextcheck --ignore dead-path    # skip a rule
contextcheck --only stale-command  # run only these rules
```

Example output:

```
AGENTS.md — 2 issues

 error  line 9     command `npm run biuld` not found (no `biuld` task in the repo)
                   did you mean `build`?
 error  line 22    path `src/Services/types.ts` exists with different casing; this breaks case-sensitive (Linux) CI
                   did you mean `src/services/types.ts`?
```

### Options

| Flag | Description |
|---|---|
| `--recursive`, `-r` | Lint every nested context file (monorepo mode) and check for cross-file contradictions. |
| `--explain` | Propose LLM fix diffs for the findings (opt-in; needs `ANTHROPIC_API_KEY`). Never edits files. |
| `--format <human\|json\|sarif>` | Output format. Default `human`. `sarif` for GitHub code scanning. |
| `--severity-threshold <error\|warn\|info>` | Severity that causes a non-zero exit. Default `error`. |
| `--only <rules>` | Comma-separated rule ids to run exclusively. |
| `--ignore <rules>` | Comma-separated rule ids to skip. |

### Monorepos

`--recursive` discovers every `AGENTS.md` / `CLAUDE.md` in the tree. Each nested
file resolves its claims against the **nearest** manifest (so
`packages/api/AGENTS.md` checks `packages/api/package.json` first), and sibling
files that document the same task differently are flagged. The bridge pattern —
a `CLAUDE.md` that just contains `@AGENTS.md` — is never flagged.

### Configuration file

Drop a `.contextcheckrc.json` at your repo root to set per-repo defaults:

```json
{
  "rules": { "oversized": false },
  "severity": { "undocumented-task": "warn" },
  "ignore": ["docs/legacy"]
}
```

- **`rules`** — enable/disable rules (`false` disables).
- **`severity`** — override a rule's severity (`error` / `warn` / `info`).
- **`ignore`** — drop findings from files whose path contains any of these substrings.

CLI flags (`--only` / `--ignore`) take precedence over the config file.

### Exit codes

`contextcheck` exits non-zero when any finding meets the severity threshold, so it
drops straight into CI:

```yaml
- run: npx contextcheck-cli --severity-threshold error
```

### Optional LLM fixes (`--explain`)

Off by default. With `--explain` and an `ANTHROPIC_API_KEY` in the environment
(bring your own key), Context Check asks an LLM to propose a **diff** that fixes
*only the findings it already reported* — never a freeform review. The diff is
printed for you to apply; `--explain` never edits files, and the deterministic
linter needs no key or network.

```bash
ANTHROPIC_API_KEY=sk-... contextcheck --explain
```

## What it checks

| Rule | Severity | Meaning |
|---|---|---|
| `stale-command` | Error | A command names a task the repo doesn't define. Suggests the closest match. |
| `dead-path` | Error / Warning | A referenced path doesn't exist. Error for explicit paths, warning for prose mentions. |
| `case-mismatch-path` | Error | A path exists but with different casing — breaks case-sensitive CI. |
| `wrong-package-manager` | Info | A command uses `npm` while the repo's lockfile is pnpm/yarn/bun. |
| `undocumented-task` | Info | The repo defines an important task (`test`/`build`/`lint`/`typecheck`/`dev`) the context file never mentions. |
| `tool-mismatch` | Warning | The context file names a tool (e.g. Jest) while the repo uses a competitor (e.g. Vitest). |
| `oversized` | Warning | The context file exceeds 150 lines; reports the largest sections. |
| `staleness` | Info / Warning | Many commits (esp. manifest-touching) have landed since the context file changed. Info above 10, warning above 30. |
| `cross-file-contradiction` | Error | Two context files in the same directory document the same task with different commands. |

## Supported ecosystems

Command claims are verified against tasks the repo actually defines, across:

- **npm family** — `package.json` scripts (npm/pnpm/yarn/bun)
- **Make** — `Makefile` targets (incl. `.PHONY`)
- **Python** — `pyproject.toml` scripts (project/poetry/hatch) and `tox` envs
- **Rust** — `Cargo.toml` bins/examples and `.cargo/config.toml` aliases
- **Go** — `go.mod` (module detection; tasks via `Makefile`)
- **just** — `justfile` recipes
- **Task** — `Taskfile.yml` tasks
- **Gradle / Maven** — `build.gradle(.kts)` tasks and `pom.xml` profiles (best-effort)

Path and casing checks are language-agnostic and work in any repo.

## GitHub Action

Catch drift where it actually bites — in pull requests. The
[Context Check Action](action/) lints changed context files on every PR, posts a
single self-updating comment with the findings, and warns when a PR changes a
manifest (`package.json`, …) but forgets to update `AGENTS.md`.

```yaml
# .github/workflows/contextcheck.yml
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  contextcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: jubins/contextcheck/action@v0
```

Warn-only by default so it never blocks a merge. It can also upload **SARIF**
so findings appear inline in the Files Changed tab. See [`action/`](action/) for options.

## VS Code extension

Prefer to see findings inline as you edit? Install
**[Context Check](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck)**
from the Marketplace — diagnostics in the Problems panel, quick fixes, and a
findings sidebar. Docs in [`vscode/`](vscode/).

## Programmatic use

The package also exposes a library:

```ts
import { lintFile } from "contextcheck-cli";

const { findings } = await lintFile("AGENTS.md", process.cwd());
```

## Development

```bash
npm install
npm test          # run the core suite
npm run build     # bundle the core (dist/)
npm run typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and how to add rules.

## Design principles

- **Zero network calls, no API keys, no telemetry.**
- Every check is deterministic and explainable.
- If a claim can't be verified with certainty, warn — never a false error.
- False positives are worse than missed detections.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and
the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Jubin Soni
