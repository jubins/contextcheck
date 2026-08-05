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

async function readFileSafe(p: string): Promise<string | undefined> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Extract the key names from specific TOML tables without a full TOML parser.
 * We only need script/command names, which are the keys of tables like
 * `[project.scripts]`. `tableMatcher` decides which tables to harvest.
 *
 * Handles: table headers `[a.b.c]`, quoted keys, and `key = value` lines.
 * Ignores arrays-of-tables `[[...]]` and inline tables (good enough for the
 * script tables we target).
 */
export function tomlTableKeys(
  toml: string,
  tableMatcher: (table: string) => boolean,
): string[] {
  const keys: string[] = [];
  let inTarget = false;

  for (const rawLine of toml.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    // Table header?
    const header = line.match(/^\[([^[\]]+)\]\s*(#.*)?$/);
    if (header) {
      inTarget = tableMatcher(header[1]!.trim());
      continue;
    }
    // Array-of-tables header `[[...]]` — never a script table we want.
    if (/^\[\[/.test(line)) {
      inTarget = false;
      continue;
    }

    if (!inTarget) continue;

    // key = value  (key may be bare or quoted)
    const kv = line.match(/^("([^"]+)"|'([^']+)'|[A-Za-z0-9_.-]+)\s*=/);
    if (kv) {
      const key = kv[2] ?? kv[3] ?? kv[1]!;
      keys.push(key);
    }
  }
  return keys;
}

/** Script names from pyproject.toml (project, poetry, and hatch env scripts). */
export function parsePyprojectScripts(toml: string): string[] {
  const names = new Set<string>();
  const collect = (matcher: (t: string) => boolean) => {
    for (const k of tomlTableKeys(toml, matcher)) names.add(k);
  };
  collect((t) => t === "project.scripts");
  collect((t) => t === "tool.poetry.scripts");
  // [tool.hatch.envs.<env>.scripts]
  collect((t) => /^tool\.hatch\.envs\.[^.]+\.scripts$/.test(t));
  return [...names];
}

/** Environment names from tox.ini `envlist = a, b, c`. */
export function parseToxEnvlist(ini: string): string[] {
  const names = new Set<string>();
  // envlist can span multiple lines; grab the block after `envlist =`.
  const match = ini.match(/^\s*envlist\s*=(.*(?:\n[ \t]+.*)*)/m);
  if (match) {
    for (const part of match[1]!.split(/[\s,]+/)) {
      const name = part.trim();
      if (name) names.add(name);
    }
  }
  // Also collect [testenv:NAME] section names.
  for (const m of ini.matchAll(/^\[testenv:([^\]]+)\]/gm)) {
    names.add(m[1]!.trim());
  }
  return [...names];
}

export class PythonResolver implements Resolver {
  readonly name = "python";

  async detect(repoRoot: string): Promise<boolean> {
    return (
      (await exists(join(repoRoot, "pyproject.toml"))) ||
      (await exists(join(repoRoot, "tox.ini")))
    );
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const out = new Map<string, TaskInfo>();

    const pyproject = await readFileSafe(join(repoRoot, "pyproject.toml"));
    if (pyproject) {
      for (const name of parsePyprojectScripts(pyproject)) {
        out.set(name, { name, source: this.name });
      }
    }

    const tox = await readFileSafe(join(repoRoot, "tox.ini"));
    if (tox) {
      for (const name of parseToxEnvlist(tox)) {
        if (!out.has(name)) out.set(name, { name, source: this.name });
      }
    }

    return out;
  }
}
