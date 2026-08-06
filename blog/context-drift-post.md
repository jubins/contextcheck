# Your AGENTS.md Is Lying to Your AI

*Nobody lints the one file every coding agent reads first.*

![HERO: A split image — left, an AGENTS.md with red squiggles under two commands; right, a terminal showing contextcheck output with red "error" lines. Suggested size 1400×700.](placeholder-hero.png)

---

Last month I renamed an npm script. `build:prod` became `build:release` — a
thirty-second change, one line in `package.json`, and every workflow that
referenced it updated in the same commit. Tests green. PR merged. Done.

Three days later I asked Claude to cut a release. It confidently ran
`npm run build:prod`, got "missing script," and then did what a good agent does
when a command fails: it tried to be helpful. It guessed. It tried
`npm run prod`. It read some files. It proposed a `package.json` "fix" that
would have re-added the script I'd deliberately removed.

The agent wasn't broken. It was doing exactly what I told it to do — in
`AGENTS.md`, a file I'd written six weeks earlier and hadn't opened since.

## The file nobody maintains

If you use Claude Code, Cursor, Copilot Workspace, or any of the dozen agent
harnesses that shipped this year, you probably have one of these:
`AGENTS.md`, `CLAUDE.md`, `.cursorrules`. It tells the agent how your project
works — how to build, how to test, where things live, which conventions matter.

It is, functionally, **the most-read file in your repository**. Every agent
session starts by loading it.

It is also the only file in your repository that **nothing verifies**.

Think about what we do for every other kind of correctness:

- Types are checked by the compiler.
- Style is checked by the linter.
- Behavior is checked by tests.
- Dependencies are checked by the lockfile.
- Even prose gets a spellchecker.

And the file that instructs an autonomous agent with write access to your
codebase? That one we just... trust. Written once, during the initial
enthusiasm of setting up a new tool, and then left to rot while the code
underneath it moves.

I started calling this **context drift**, and once I had a name for it I
started seeing it everywhere.

## Why drift is worse than a stale comment

A stale code comment is a minor annoyance. A human reads it, notices it
disagrees with the code, and trusts the code. We're all trained to do this —
comments are hints, not truth.

An agent does the opposite. Your `AGENTS.md` is the highest-authority context
it has. When the file says `npm run build:prod` and the repo says otherwise, the
agent doesn't shrug and check `package.json`. It believes you, runs the command,
fails, and then starts *problem-solving* — burning tokens, taking detours, and
sometimes "fixing" the repository to match the documentation instead of the
other way around.

The failure mode isn't "the agent didn't know something." It's **the agent knew
something false, with confidence, from an authoritative source.**

And drift is silent by construction. Nothing fails when you rename a script and
forget the docs. There's no red X. The cost shows up later, distributed across
every future agent session, as a slow tax you never quite attribute to its
cause.

![DIAGRAM: A timeline. Day 0 — AGENTS.md and package.json agree (both green). Day 14 — a commit renames a script; package.json turns green-updated, AGENTS.md stays amber. Day 30 — an agent reads the amber file and takes a wrong turn (red). Caption: "Nothing fails at day 14. That's the problem." Suggested size 1400×500.](placeholder-drift-timeline.png)

## So I built the missing linter

The idea is almost embarrassingly simple: **your context file makes checkable
claims about your repository. Go check them.**

When `AGENTS.md` says:

```markdown
Run `npm run biuld` to build.
The router lives at `src/routes/index.ts`.
Shared types are in `src/Services/types.ts`.
```

...those are three falsifiable statements. There *is* a fact of the matter about
whether a `biuld` script exists, whether that path exists, and whether that
casing is right. You don't need a model to check them. You need a parser and a
filesystem.

That's [Context Check](https://github.com/jubins/contextcheck). It parses your
context file into claims, resolves each claim against the actual repo, and
reports the ones that don't hold up.

Here's it running against a deliberately-broken sample project:

![SCREENSHOT: Terminal output of `contextcheck` on the demo workspace, showing the error/warn/info lines with "did you mean" suggestions. Use a dark terminal theme, ~100 cols wide, and don't crop the suggestion lines. Suggested size 1400×900.](placeholder-terminal.png)

```
AGENTS.md — 12 issues

 error  line 22    command `npm run biuld` not found (no `biuld` task in the repo)
                   did you mean `build`?
 error  line 44    path `src/routes/index.ts` does not exist
 error  line 46    path `src/Services/types.ts` exists with different casing;
                   this breaks case-sensitive (Linux) CI
                   did you mean `src/services/types.ts`?
 warn   line 30    claims `jest` but the repo uses `vitest`
                   update the docs to reference `vitest`
 info   line 13    command uses `npm` but this repo's lockfile indicates pnpm
                   use `pnpm` to match the repo
```

Note the third one. `src/Services/types.ts` works fine on your Mac and breaks in
CI, because macOS is case-insensitive and Linux isn't. That's a class of bug I've
personally shipped more than once, and it's *invisible* until it isn't.

## What it actually checks

Nine rules, all deterministic:

| Rule | What it catches |
|---|---|
| `stale-command` | A documented command names a task the repo doesn't define — with a "did you mean" suggestion |
| `dead-path` | A referenced file or directory doesn't exist |
| `case-mismatch-path` | The path exists but with different casing (breaks Linux CI) |
| `wrong-package-manager` | Docs say `npm`, but the lockfile says pnpm/yarn/bun |
| `undocumented-task` | The repo defines `test`/`build`/`lint` that the docs never mention |
| `tool-mismatch` | Docs name Jest; `package.json` depends on Vitest |
| `oversized` | The file has sprawled past readability — reports the biggest sections |
| `staleness` | Many commits have touched manifests since the docs last changed |
| `cross-file-contradiction` | `AGENTS.md` and `CLAUDE.md` document the same task differently |

Command verification works across ecosystems — npm scripts, Make targets, Python
(`pyproject.toml`, tox), Rust, just, Task, and Gradle/Maven. Path and casing
checks are language-agnostic.

The design constraint I held throughout: **false positives are worse than missed
detections.** A linter that cries wolf gets disabled in a week. When a claim
can't be verified with confidence, it warns instead of erroring — or says
nothing at all.

## Catch it where you'll actually fix it

A CLI is only useful if you remember to run it. So there are three surfaces, and
the interesting thing is that each catches drift at a different moment.

### In your editor, as you type

![SCREENSHOT/GIF: VS Code with AGENTS.md open — red squiggles under the bad command and path, the Problems panel populated below, and the Context Check sidebar visible in the Activity Bar. If a GIF, show hovering a squiggle and applying the "did you mean" quick fix. Keep under 10 seconds. Suggested size 1400×850.](placeholder-vscode.png)

Diagnostics in the Problems panel, a findings sidebar, and quick fixes for the
mechanical stuff — click the lightbulb and `biuld` becomes `build`, or a
wrong-cased path snaps to its real casing.

### In your pull requests

![SCREENSHOT: The GitHub Action's PR comment showing a findings table, plus the "this PR changes package.json but no context file" warning. Suggested size 1400×600.](placeholder-pr-comment.png)

The GitHub Action posts a single self-updating comment on each PR. It also warns
when a PR touches a manifest but *doesn't* touch a context file — which is drift
being created in real time, caught at the exact moment it's cheapest to fix.

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
      - uses: jubins/contextcheck/action@v0
```

Warn-only by default, so it never blocks a merge until you decide it should. It
can also upload SARIF, which puts findings inline in the Files Changed tab.

### In CI, as a gate

```bash
npx contextcheck-cli --severity-threshold error
```

Non-zero exit when anything meets the threshold. That's the whole integration.

## The part I deliberately kept boring

Context Check does not call an LLM. There's no API key, no network request, no
telemetry. Every check is a parser and a filesystem lookup.

This was a deliberate constraint, and I want to defend it, because "use AI to
check your AI files" is the obvious move and I think it's the wrong one.

The claims worth checking are **exactly the ones that don't need judgment**.
Does this script exist? Does this path resolve? Is this casing right? A model
would answer these more slowly, less reliably, and non-deterministically — and
it would occasionally hallucinate a problem that isn't there. For a tool that
runs on every save and every PR, deterministic and instant beats clever.

There *is* an optional LLM tier — `--explain`, off by default, bring your own
key — but it's scoped tightly. It only proposes a diff for findings the
deterministic rules already reported, and **it never writes to your files.** It
can't invent problems, because it never gets to decide what a problem is.

## Try it

```bash
npx contextcheck-cli
```

Run it in a repo that has an `AGENTS.md` or `CLAUDE.md` and see what it finds. I
would genuinely like to hear whether the first run surprises you — it did for me,
on my own repos, which is the reason this exists.

- **CLI:** [`contextcheck-cli`](https://www.npmjs.com/package/contextcheck-cli) on npm
- **VS Code:** [Context Check](https://marketplace.visualstudio.com/items?itemName=jubinsoni.contextcheck) on the Marketplace
- **Action + source:** [github.com/jubins/contextcheck](https://github.com/jubins/contextcheck)

MIT licensed. Issues and PRs welcome.

---

## One prediction

We spent the last decade building infrastructure to keep code honest — types,
linters, tests, CI. We're now handing large parts of our codebases to agents
whose primary instruction file has none of that.

I don't think `AGENTS.md` stays unverified for long. It's too load-bearing. The
same way nobody would ship a repo where `package.json` was never validated,
we'll stop shipping repos where the agent's instructions were never checked.

Context drift is just tech debt in a file we haven't learned to treat as code
yet.

---

*If you found this useful, the repo is [here](https://github.com/jubins/contextcheck)
— a star helps other people find it.*
