# Change Log

All notable changes to the Context Check extension are documented here.

## [1.0.0] - 2026-08-04

First stable release. The npm package, VS Code extension, and GitHub Action are
now aligned at v1.

### Added

- **`wrong-package-manager`** rule (info) — flags `npm` commands in a repo whose
  lockfile indicates pnpm/yarn/bun.
- **`undocumented-task`** rule (info) — flags important tasks the repo defines
  (`test`/`build`/`lint`/`typecheck`/`dev`) that the context file never mentions.
- **`tool-mismatch`** rule (warn) — the context file names a tool (e.g. Jest)
  while the repo's manifests show a competitor (e.g. Vitest).
- **`oversized`** rule (warn) — the context file exceeds 150 lines; the message
  lists the three largest sections.
- **GitHub Action** (`jubins/contextcheck/action@v1`) — lints context files on
  pull requests, posts a single self-updating comment, and warns when a PR
  changes a manifest but no context file. Supports SARIF upload so findings
  appear in the Files Changed tab.
- **`--format sarif`** — SARIF 2.1.0 output for GitHub code scanning.
- **`.contextcheckrc.json`** — per-repo config for rule enable/disable,
  severity overrides, and ignore patterns.
- **`staleness`** rule — flags when many commits (especially manifest-touching
  ones) have landed since the context file last changed. Info above 10 manifest
  commits, warning above 30. Read-only git; degrades silently outside git.
- **Polyglot support** — command claims are now verified across many
  ecosystems in addition to the npm family: Make targets, Python
  (`pyproject.toml`/`tox`), Rust (`Cargo.toml` bins/examples and aliases),
  just recipes, Task (`Taskfile.yml`), and Gradle/Maven (best-effort). Go
  repos are detected via `go.mod`.

## [0.1.2] - 2026-08-04

### Changed

- No functional changes. First release cut through the automated release
  pipeline, publishing the npm package (`contextcheck-cli`) and the extension
  in lockstep at the same version.

## [0.1.1] - 2026-08-03

### Added

- **Activity Bar sidebar** — a dedicated Context Check view listing findings
  grouped by file, with a "Re-check" title button, click-to-jump, and an inline
  wrench to apply a finding's fix without opening the file. Shows a badge with
  the total issue count and a welcome view when everything is clean.
- **Case-mismatch quick fix** — `case-mismatch-path` findings are now fixable
  from the lightbulb and the sidebar, correcting a path to its on-disk casing
  (e.g. `src/Services/types.ts` → `src/services/types.ts`).

### Fixed

- Fixed broken README images on the Marketplace by using absolute image URLs
  (the Marketplace does not serve relative image paths).
- The path resolver now walks every segment and reports the full corrected
  path, fixing a case where a genuinely-missing deeper path was misreported as
  a case mismatch.

### Docs

- Rewrote the README as a polished Marketplace listing with real GIFs and
  screenshots, a before/after comparison, and a positive tagline.
- Added live Marketplace badges (version, installs, rating).
- Added `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.

## [0.1.0] - 2026-08-02

Initial release.

- Diagnostics in the Problems panel for open `AGENTS.md` / `CLAUDE.md` files,
  refreshed on save.
- Rules: `stale-command` (with "did you mean" suggestions), `dead-path`, and
  `case-mismatch-path`.
- Quick fixes for `stale-command` (replace with the suggested task) and
  `dead-path` (remove the stale reference).
- Status bar item showing the findings count for the active context file.
- Command: **Context Check: Check workspace**.
- Setting: `contextcheck.enable`.
- Fully offline — no LLM calls, API keys, or telemetry.
