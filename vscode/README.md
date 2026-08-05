<div align="center">

<img src="https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/icon.png" alt="Context Check" width="96" height="96" />

# Context Check

**Keep your AGENTS.md honest — automatically.**

[![Version](https://vsmarketplacebadges.dev/version-short/jubinsoni.contextcheck.png)](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck)
[![CI](https://github.com/jubins/contextcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/jubins/contextcheck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<!-- Add back once adoption grows (installs/rating look weak at low counts):
[![Installs](https://vsmarketplacebadges.dev/installs-short/jubinsoni.contextcheck.png)](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck)
[![Rating](https://vsmarketplacebadges.dev/rating-star/jubinsoni.contextcheck.png)](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck)
-->


</div>

Context Check lints AI agent context files (`AGENTS.md`, `CLAUDE.md`, and friends)
against your **actual repository** — flagging commands, paths, and casing that have
gone stale, right inside VS Code.

> Free and open source. No account, no API key, no telemetry — every check runs
> locally and is deterministic.

![Context Check demo](https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/media/demo.gif)

---

## Why

Agent context files drift. You rename an npm script, move a folder, or switch
tools — but the `AGENTS.md` you handed your AI still points at the old world, so
your agent confidently runs commands that no longer exist.

| Without Context Check | With Context Check |
|---|---|
| ![Stale AGENTS.md, no warnings](https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/media/before.png) | ![The same file with findings surfaced](https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/media/after.png) |

---

## Features

- **Stale command detection** — a command like `npm run build` that no longer
  exists in `package.json`, with a *"did you mean `build:prod`?"* suggestion.
- **Dead path detection** — a referenced file or directory that isn't there.
- **Case-mismatch detection** — a path that resolves on macOS but breaks
  case-sensitive Linux CI, with a one-click casing fix.
- **Quick fixes** — apply the suggested fix from the editor lightbulb or the sidebar.
- **Dedicated sidebar** — an Activity Bar view grouping every finding by file.
- **Status bar count** — the active file's issue count at a glance.
- **Deterministic & explainable** — every finding maps to a rule you can read. No LLM guessing.

---

## Getting Started

### 1. Install

Search **"Context Check"** in the VS Code Extensions panel, or install from the
[Marketplace](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck).

### 2. Open a context file

Open a repo that has an `AGENTS.md` or `CLAUDE.md`. Findings appear immediately in
the editor and the **Problems** panel, and refresh every time you save.

![Inline error with the fix lightbulb](https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/media/inline-lightbulb.png)

### 3. Fix issues

Click the lightbulb (⌘.) on a finding to apply its fix — replace a stale command
with the real script, or correct a path's casing.

![Applying a quick fix](https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/media/quickfix.gif)

---

## The sidebar

Click the **Context Check** icon in the Activity Bar to open the **Findings** view.
It groups every issue across your workspace by file, and shows a badge with the
total count.

| Findings grouped by file | Apply a fix inline |
|---|---|
| ![Sidebar with issue count badge](https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/media/sidebar-badge.png) | ![Inline apply-fix wrench on each issue](https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/media/sidebar-applyfix.png) |

- **Re-check** (the refresh button in the view's title bar) re-scans the whole workspace.
- **Click a finding** to jump straight to it in the editor.
- **The wrench** on a fixable finding applies its fix without opening the file.

Once everything is fixed, the view is clean:

![Clean state after applying all fixes](https://raw.githubusercontent.com/jubins/contextcheck/master/vscode/media/clean-recheck.png)

---

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

---

## Commands

All actions are available from the sidebar and the Command Palette
(`Cmd+Shift+P` / `Ctrl+Shift+P` → type **"Context Check"**).

| Command | Description |
|---|---|
| `Context Check: Check workspace` | Scan every context file in the workspace and report all findings. |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `contextcheck.enable` | `true` | Enable or disable Context Check diagnostics. |

---

## Privacy

Context Check runs **entirely on your machine**. It reads your context files and
your repository's manifests (`package.json`, etc.) to verify claims. It makes
**no network requests**, stores no data, and sends no telemetry.

---

## Requirements

- VS Code 1.85 or later.
- A workspace containing an `AGENTS.md` or `CLAUDE.md` file.

---

## Contributing

Issues and pull requests are welcome at
[github.com/jubins/contextcheck](https://github.com/jubins/contextcheck/issues).
See [CONTRIBUTING.md](https://github.com/jubins/contextcheck/blob/master/CONTRIBUTING.md)
and the [Code of Conduct](https://github.com/jubins/contextcheck/blob/master/CODE_OF_CONDUCT.md).

---

## License

[MIT](LICENSE) © Jubin Soni
