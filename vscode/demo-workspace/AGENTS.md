# Demo Project

A tiny sample repo for demonstrating **Context Check**. Several claims below are
intentionally wrong so every rule has something to flag. Open this file in the
Extension Development Host and watch the Problems panel and the Context Check
sidebar light up.

## Setup

Install dependencies with npm:

```bash
npm install
```

> This repo actually uses **pnpm** (see `pnpm-lock.yaml`), so the line above
> trips the `wrong-package-manager` rule.

## Build

```bash
npm run biuld
```

> `biuld` is a typo — the real script is `build`. That's a `stale-command`
> finding, and Context Check suggests the closest match.

## Test

We run the suite with Jest.

```bash
npm run test
```

> The prose names **Jest**, but `package.json` depends on **vitest**, so this
> trips the `tool-mismatch` rule. The command itself is correct — but the
> sibling `CLAUDE.md` documents the same test task with the Makefile target
> instead, which `ctxcheck --recursive` flags as a `cross-file-contradiction`.

## Layout

- The entry point is `src/services/auth.ts`. This one is correct.
- The router lives at `src/routes/index.ts`. A `dead-path` finding — no such
  file exists.
- Shared types are in `src/Services/types.ts`. A `case-mismatch-path` finding —
  the real folder is lowercase `services`.

## Notes for agents

The remainder of this file is deliberate filler so the document crosses the
150-line threshold and triggers the `oversized` rule. In a real project this is
where an over-eager context file accumulates cruft that no longer helps the
agent and mostly adds noise. Context Check flags the file and points at its
three largest sections so you know where to trim.

Note that the repo also defines a `lint` task (in `package.json` and the
`Makefile`) that this file never documents — that is the `undocumented-task`
rule. And the sibling `CLAUDE.md` documents the `test` task with a different
command, which `ctxcheck --recursive` flags as a `cross-file-contradiction`.

### Coding conventions

- Prefer small, focused modules over large files.
- Every exported function gets a short doc comment.
- Keep side effects out of module top level.
- No default exports; use named exports for grep-ability.
- Tests live next to the code they cover.
- Run the formatter before committing.
- Avoid clever one-liners that hurt readability.
- Keep functions under about forty lines where practical.
- Name things for what they are, not how they are built.
- Delete dead code rather than commenting it out.

### Review checklist

- Does the change do exactly what the PR says and nothing more?
- Are there tests for the new behaviour?
- Do the docs still match the code after this change?
- Is there a simpler implementation that reads as clearly?
- Are error paths handled, not just the happy path?
- Did we avoid introducing a new dependency for something small?
- Is anything logged that should not be, such as secrets or tokens?
- Would this be obvious to someone reading it in six months?

### Release process

- Bump the version in the manifest.
- Update the changelog with user-facing notes.
- Tag the release and push tags.
- Verify the published artifact installs cleanly.
- Announce in the team channel.
- Watch error rates for the first hour after release.

### Frequently asked questions

- Why pnpm? Faster installs and a stricter dependency tree.
- Where do I add a new service? One file per service, alongside the others.
- How do I run a single test? Pass the file path to the test runner.
- What Node version? The latest LTS.
- Can I use default exports? No — see the coding conventions above.

### Glossary

- Session — an authenticated user's active token and its expiry.
- Service — a cohesive unit of business logic with a narrow public API.
- Route — an HTTP endpoint that delegates to one or more services.
- Manifest — a file that declares tasks and dependencies.

### More filler so we clear 150 lines

- Line one of intentional padding.
- Line two of intentional padding.
- Line three of intentional padding.
- Line four of intentional padding.
- Line five of intentional padding.
- Line six of intentional padding.
- Line seven of intentional padding.
- Line eight of intentional padding.
- Line nine of intentional padding.
- Line ten of intentional padding.
- Line eleven of intentional padding.
- Line twelve of intentional padding.
- Line thirteen of intentional padding.
- Line fourteen of intentional padding.
- Line fifteen of intentional padding.
- Line sixteen of intentional padding.
- Line seventeen of intentional padding.
- Line eighteen of intentional padding.
- Line nineteen of intentional padding.
- Line twenty of intentional padding.
- Line twenty-one of intentional padding.
- Line twenty-two of intentional padding.
- Line twenty-three of intentional padding.
- Line twenty-four of intentional padding.
- Line twenty-five of intentional padding.
- Line twenty-six of intentional padding.
- Line twenty-seven of intentional padding.
- Line twenty-eight of intentional padding.
- Line twenty-nine of intentional padding.
- Line thirty of intentional padding.
- Line thirty-one of intentional padding.
- Line thirty-two of intentional padding.
- Line thirty-three of intentional padding.
- Line thirty-four of intentional padding.
- Line thirty-five of intentional padding.
- Line thirty-six of intentional padding.
- Line thirty-seven of intentional padding.
- Line thirty-eight of intentional padding.
- Line thirty-nine of intentional padding.
- Line forty of intentional padding.
- Line forty-one of intentional padding.
- Line forty-two of intentional padding.
- Line forty-three of intentional padding.
