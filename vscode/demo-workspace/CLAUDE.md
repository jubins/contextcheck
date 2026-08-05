# Demo Project — Claude notes

This sibling context file exists to demonstrate the `cross-file-contradiction`
rule. It documents the **same** `test` task as `AGENTS.md`, but with a
**different** command. Run `ctxcheck --recursive` in this directory to see it
flagged.

## Test

```bash
make test
```

`AGENTS.md` documents the test task as an npm script; this file uses the
Makefile target instead. Two sibling files, same task, different commands —
that is a contradiction.
