# Context Check

A linter that verifies AI agent context files (AGENTS.md, CLAUDE.md, and friends)
against the actual repository. Deterministic checks first, LLM assistance last.

We dogfood: this file is checked by the tool it documents.

## Setup

```bash
npm install
```

## Common tasks

```bash
npm run build      # bundle the library with tsup
npm test           # run the vitest suite
npm run typecheck  # type-check without emitting
```

## Layout

- `src/types.ts` — shared `Claim` and `Finding` contracts
- `src/extract/` — pull claims from a markdown AST
- `src/resolve/` — answer "does this claim match something real in the repo?"
- `src/checks/` — turn claims + resolvers into findings
- `src/index.ts` — public library entry
- `vscode/` — thin VS Code extension wrapping the library

## Non-negotiable constraints

- Zero network calls in the core. No API keys. No telemetry.
- Every check is deterministic and explainable.
- If a check cannot be verified with certainty, emit `info`, never `error`.
- False positives are worse than missed detections.
