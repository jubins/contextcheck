# Contributing to Context Check

Thank you for your interest in contributing!

---

## 🐛 Did you find a bug?

- Ensure the bug was not already reported by searching [GitHub Issues](https://github.com/jubins/contextcheck/issues).
- If you can't find an open issue addressing the problem, [open a new one](https://github.com/jubins/contextcheck/issues/new). Include a clear title, description, steps to reproduce, and what you expected to happen. A minimal `AGENTS.md` plus the repository state that triggers a false positive is especially helpful.

## 🔧 Did you write a patch that fixes a bug?

- Open a new GitHub pull request with the patch.
- Clearly describe the problem and solution in the PR description. Include the relevant issue number if applicable.
- Add a test: every rule has a positive and a negative case, and every fix has a unit test. See [Testing](#testing).
- Before submitting, please read the [Code of Conduct](./CODE_OF_CONDUCT.md).

## 💡 Do you intend to add a new feature or change an existing one?

- [Open a discussion](https://github.com/jubins/contextcheck/discussions) under the **Ideas** category first to gather feedback before writing code.
- Once you have positive feedback, fork the repo, implement the change, and open a PR.
- Reference the discussion number in your PR — PRs for non-trivial features without a linked discussion may be closed without review.

## ❓ Do you have questions about the source code?

Ask in the [Discussions tab](https://github.com/jubins/contextcheck/discussions).

---

## 🏗️ Guidelines

### Design principles

These are non-negotiable — please keep changes aligned with them:

- **Zero network calls in the core. No API keys. No telemetry.**
- Every check is deterministic and explainable.
- If a claim cannot be verified with certainty, emit a warning — never a false `error`.
- **False positives are worse than missed detections.** A linter that cries wolf gets uninstalled.

### Project structure

This is a monorepo: the `ctxcheck` core library and CLI live at the root, and the VS Code extension is a thin wrapper under `vscode/`.

```
src/                          # ctxcheck core library + CLI
├── index.ts                  # Public library entry
├── cli.ts                    # commander-based CLI (ctxcheck / contextcheck)
├── types.ts                  # Shared Claim and Finding contracts
├── lint.ts                   # Orchestrates extract -> resolve -> check
├── discover.ts               # Finds context files and the repo root
├── report.ts                 # Human / JSON output
├── extract/                  # Pull claims (commands, paths) from the markdown AST
├── resolve/                  # Answer "does this claim match something real?"
│   ├── npm.ts                # package.json scripts + package-manager detection
│   └── path.ts               # Path resolution: exists / case-mismatch / missing
└── checks/                   # Turn claims + resolvers into findings
    ├── index.ts              # stale-command, dead-path, case-mismatch-path
    ├── command-target.ts     # Map `npm run build` -> the "build" task
    └── levenshtein.ts        # "did you mean" suggestions

vscode/                       # VS Code extension (bundles the core)
├── src/
│   ├── extension.ts          # Entry point — diagnostics, status bar, sidebar, commands
│   ├── fixes.ts              # buildFix/fixTitle — shared by the lightbulb and the sidebar
│   └── tree.ts               # Activity Bar findings tree data provider
├── demo-workspace/           # An intentionally-broken AGENTS.md for F5 testing
└── media/                    # README GIFs and screenshots

test/                         # Vitest suite + real fixture repos (core)
```

### Adding a new rule (core)

1. Add the checker in `src/checks/index.ts` (or a new file it re-exports). Return `Finding[]` with a stable `rule` id, a `severity`, and `fixable`.
2. If the rule needs new repository knowledge, add or extend a resolver in `src/resolve/`.
3. Make the rule individually disableable via the `RuleConfig` map.
4. Add both a **positive** and a **negative** test with a real fixture under `test/fixtures/` — do not stub repositories.

### Adding a quick fix (extension)

Fixes are generated in `vscode/src/fixes.ts` so the editor lightbulb and the sidebar wrench apply identical edits:

1. Add a case to `fixTitle()` (the label) and `buildFix()` (the `WorkspaceEdit`).
2. If the core needs to supply extra data for the fix (e.g. a corrected path), thread it through the `Finding.suggestion` field.
3. Add a unit test in `vscode/test/fixes.test.ts`.

### Adding a new command or view (extension)

1. Register it in `vscode/package.json` under `contributes > commands` (and a `menus` entry for a toolbar button or context menu item).
2. Register the handler in `vscode/src/extension.ts` inside `activate()`.
3. Sidebar tree changes go in `vscode/src/tree.ts`.

### Running locally

Core:

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest
npm run build         # bundle the core (dist/)
```

Extension (build the core first, since the extension bundles it):

```bash
cd vscode
npm install
npm test              # extension unit tests
npm run build         # bundle the extension
```

Press `F5` in the `vscode/` folder to launch an Extension Development Host with the extension loaded against `vscode/demo-workspace/`.

### Dogfooding

This repo lints its own `AGENTS.md`. Before opening a PR, run `node ./dist/cli.js .` from the root and make sure it reports no issues.

---
