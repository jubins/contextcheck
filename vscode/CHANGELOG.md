# Change Log

All notable changes to the Context Check extension are documented here.

## [0.1.1] - 2026-08-03

- **Activity Bar sidebar** — a dedicated Context Check view listing findings
  grouped by file, with a "Re-check" title button, click-to-jump, and an inline
  wrench to apply a finding's fix without opening the file.
- Fixed broken README images on the Marketplace by using absolute image URLs
  (the Marketplace does not serve relative image paths).

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
