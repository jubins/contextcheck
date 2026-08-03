<div align="center">

<img src="vscode/icon.png" alt="Context Check" width="96" height="96" />

# Context Check

**Your AGENTS.md is telling your agent things that aren't true.**

A linter that verifies AI agent context files (`AGENTS.md`, `CLAUDE.md`, and
friends) against your **actual repository**. Deterministic checks, no network,
no API keys.

[![CI](https://github.com/jubins/contextcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/jubins/contextcheck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

Agent context files drift. You rename an npm script, move a folder, switch from
Jest to Vitest — but the `AGENTS.md` you handed your AI still points at the old
world, so your agent confidently runs commands that no longer exist.

Context Check reads the claims in your context file — commands, paths — and
verifies each one against what's really in the repo, flagging the stale ones.

## What it checks

| Rule | Severity | Meaning |
| --- | --- | --- |
| `stale-command` | Error | A command names a task the repo doesn't define. Suggests the closest match. |
| `dead-path` | Error / Warning | A referenced path doesn't exist. |
| `case-mismatch-path` | Error | A path exists but with different casing — breaks case-sensitive CI. |

## This repository

| Path | What it is |
| --- | --- |
| [`src/`](src/) | The `ctxcheck` core library and CLI |
| [`vscode/`](vscode/) | The **Context Check** VS Code extension (a thin wrapper around the core) |
| [`test/`](test/) | Vitest suite and fixture repos |

## Using the CLI

```bash
# from a repo that has an AGENTS.md or CLAUDE.md
npx ctxcheck            # human-readable report
npx ctxcheck --format json
```

Exit code is non-zero when any finding meets the severity threshold (default:
`error`), so it drops straight into CI.

## The VS Code extension

Diagnostics in the Problems panel for open context files, quick fixes, and a
status-bar findings count. See [`vscode/README.md`](vscode/README.md) and
install from the
[Marketplace](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck).

## Development

```bash
npm install
npm test          # run the suite
npm run build     # bundle the core (dist/)
npm run typecheck
```

The extension is built separately: `cd vscode && npm install && npm run build`,
then press **F5** in VS Code to launch it against `vscode/demo-workspace/`.

## Design principles

- **Zero network calls, no API keys, no telemetry.**
- Every check is deterministic and explainable.
- If a claim can't be verified with certainty, emit a warning — never a false error.
- False positives are treated as bugs.

## License

[MIT](LICENSE) © Jubin Soni
