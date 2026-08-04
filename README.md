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

The package installs two identical binaries: `ctxcheck` and `contextcheck`.

## Usage

Run it from the root of a repo that has an `AGENTS.md` or `CLAUDE.md`:

```bash
ctxcheck                       # check the current directory
ctxcheck path/to/dir           # check a specific directory
ctxcheck --format json         # machine-readable output
ctxcheck --ignore dead-path    # skip a rule
ctxcheck --only stale-command  # run only these rules
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
| `--format <human\|json>` | Output format. Default `human`. |
| `--severity-threshold <error\|warn\|info>` | Severity that causes a non-zero exit. Default `error`. |
| `--only <rules>` | Comma-separated rule ids to run exclusively. |
| `--ignore <rules>` | Comma-separated rule ids to skip. |

### Exit codes

`ctxcheck` exits non-zero when any finding meets the severity threshold, so it
drops straight into CI:

```yaml
- run: npx contextcheck-cli --severity-threshold error
```

## What it checks

| Rule | Severity | Meaning |
|---|---|---|
| `stale-command` | Error | A command names a task the repo doesn't define. Suggests the closest match. |
| `dead-path` | Error / Warning | A referenced path doesn't exist. Error for explicit paths, warning for prose mentions. |
| `case-mismatch-path` | Error | A path exists but with different casing — breaks case-sensitive CI. |
| `wrong-package-manager` | Info | A command uses `npm` while the repo's lockfile is pnpm/yarn/bun. |
| `undocumented-task` | Info | The repo defines an important task (`test`/`build`/`lint`/`typecheck`/`dev`) the context file never mentions. |

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
      - uses: jubins/contextcheck/action@v1
```

Warn-only by default so it never blocks a merge. See [`action/`](action/) for options.

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
