# Context Check

Your AGENTS.md is telling your agent things that aren't true.

Context Check lints AI agent context files (`AGENTS.md`, `CLAUDE.md`, and
friends) against your **actual repository** — so the build commands, paths, and
tasks you promised your agent still exist.

Everything runs locally. **Zero network calls, no API keys, no telemetry.**

## What it checks

- **stale-command** — a command like `npm run build` that no longer exists in
  `package.json`. Suggests the closest real script ("did you mean `build:prod`?").
- **dead-path** — a referenced file or directory that isn't there.
- **case-mismatch-path** — a path that resolves on macOS but breaks
  case-sensitive Linux CI.

## Features

- Diagnostics in the Problems panel for open context files, refreshed on save.
- Quick fixes for `stale-command` (replace with the suggested task) and
  `dead-path` (remove the stale reference).
- A status bar item with the current findings count.
- Command: **Context Check: Check workspace** — scan every context file at once.

## Settings

- `contextcheck.enable` — turn diagnostics on or off (default: on).

## Explicitly out of scope

No LLM calls, no API-key prompts, no sign-up. Every check is deterministic and
explainable.
