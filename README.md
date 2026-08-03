<div align="center">

<img src="vscode/icon.png" alt="Context Check" width="96" height="96" />

# Context Check

[![CI](https://github.com/jubins/contextcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/jubins/contextcheck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Your AGENTS.md is telling your agent things that aren't true.**

</div>

Context Check lints AI agent context files (`AGENTS.md`, `CLAUDE.md`, and friends)
against your **actual repository** — flagging commands, paths, and casing that have
gone stale. Deterministic, offline, no API keys.

This repository contains two things:

| Path | What it is |
|---|---|
| [`vscode/`](vscode/) | The **Context Check** VS Code extension — [full docs & screenshots here](vscode/README.md) · [Marketplace](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck) |
| [`src/`](src/), [`test/`](test/) | The `ctxcheck` core library and CLI that the extension wraps |

## Using the CLI

```bash
# from a repo that has an AGENTS.md or CLAUDE.md
npx ctxcheck            # human-readable report
npx ctxcheck --format json
```

Exit code is non-zero when any finding meets the severity threshold, so it drops
straight into CI.

## Development

```bash
npm install
npm test          # run the core suite
npm run build     # bundle the core (dist/)
npm run typecheck
```

The extension is built separately: `cd vscode && npm install && npm run build`,
then press **F5** in VS Code to launch it against `vscode/demo-workspace/`.

## Design principles

- **Zero network calls, no API keys, no telemetry.**
- Every check is deterministic and explainable.
- If a claim can't be verified with certainty, warn — never a false error.

## License

[MIT](LICENSE) © Jubin Soni
