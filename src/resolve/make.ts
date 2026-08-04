import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { Resolver, TaskInfo } from "./types.js";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Makefile names we look for, in order of preference. */
const MAKEFILE_NAMES = ["Makefile", "makefile", "GNUmakefile"];

async function readMakefile(repoRoot: string): Promise<string | undefined> {
  for (const name of MAKEFILE_NAMES) {
    const p = join(repoRoot, name);
    if (await exists(p)) {
      try {
        return await readFile(p, "utf8");
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * A target line looks like `name: prereqs`. We reject:
 * - pattern rules (contain `%`)
 * - variable assignments (`FOO := ...`, handled by requiring the `:` not be
 *   immediately followed by `=`)
 * - indented lines (recipe bodies start with a tab)
 * - special/dot targets except `.PHONY` handling below
 */
const TARGET_RE = /^([a-zA-Z0-9][a-zA-Z0-9._-]*)\s*:(?!=)/;

/** Parse target names from Makefile text, including those listed in .PHONY. */
export function parseMakefileTargets(text: string): string[] {
  const targets = new Set<string>();
  const lines = text.split("\n");

  for (const rawLine of lines) {
    // Recipe bodies are tab-indented; skip them.
    if (rawLine.startsWith("\t")) continue;
    const line = rawLine.trimEnd();
    if (line.length === 0 || line.startsWith("#")) continue;

    // Collect names from `.PHONY: a b c` declarations.
    const phony = line.match(/^\.PHONY\s*:(.*)$/);
    if (phony) {
      for (const name of phony[1]!.trim().split(/\s+/)) {
        if (name) targets.add(name);
      }
      continue;
    }

    const m = line.match(TARGET_RE);
    if (!m) continue;
    const name = m[1]!;
    // Skip pattern rules and dot-targets (e.g. .DEFAULT, .SUFFIXES).
    if (name.includes("%") || name.startsWith(".")) continue;
    targets.add(name);
  }
  return [...targets];
}

export class MakefileResolver implements Resolver {
  readonly name = "makefile";

  async detect(repoRoot: string): Promise<boolean> {
    return (await readMakefile(repoRoot)) !== undefined;
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const text = await readMakefile(repoRoot);
    const out = new Map<string, TaskInfo>();
    if (!text) return out;
    for (const name of parseMakefileTargets(text)) {
      out.set(name, { name, source: this.name });
    }
    return out;
  }
}
