import { join } from "node:path";
import type { Resolver, TaskInfo } from "./types.js";
import { pathExists, readTextSafe } from "./fs-utils.js";

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

    // Array-of-tables header `[[...]]` — never a script table we want.
    if (line.startsWith("[[")) {
      inTarget = false;
      continue;
    }
    // Table header `[a.b.c]` (single brackets).
    if (line.startsWith("[") && line.includes("]")) {
      const table = line.slice(1, line.indexOf("]")).trim();
      inTarget = tableMatcher(table);
      continue;
    }

    if (!inTarget) continue;

    // key = value  (key may be bare or quoted)
    const kv = line.match(/^("([^"]+)"|'([^']+)'|[A-Za-z0-9_.-]+)\s*=/);
    if (!kv) continue;
    const key = kv[2] ?? kv[3] ?? kv[1];
    if (key) keys.push(key);
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

/** Environment names from tox.ini `envlist = a, b, c` and [testenv:NAME]. */
export function parseToxEnvlist(ini: string): string[] {
  const names = new Set<string>();
  const lines = ini.split("\n");

  // envlist may span multiple lines (continued by indentation). Read the value
  // after `envlist =` plus any following indented lines, without a nested-
  // quantifier regex.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = line.match(/^\s*envlist\s*=(.*)$/);
    if (!m) continue;
    let value = m[1] ?? "";
    for (let j = i + 1; j < lines.length; j++) {
      const cont = lines[j] ?? "";
      if (/^[ \t]+\S/.test(cont)) value += " " + cont.trim();
      else break;
    }
    for (const part of value.split(/[\s,]+/)) {
      const name = part.trim();
      if (name) names.add(name);
    }
    break;
  }

  // [testenv:NAME] section names.
  for (const raw of lines) {
    const m = raw.match(/^\[testenv:([^\]]+)\]/);
    const name = m?.[1];
    if (name) names.add(name.trim());
  }
  return [...names];
}

export class PythonResolver implements Resolver {
  readonly name = "python";

  async detect(repoRoot: string): Promise<boolean> {
    return (
      (await pathExists(join(repoRoot, "pyproject.toml"))) ||
      (await pathExists(join(repoRoot, "tox.ini")))
    );
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const out = new Map<string, TaskInfo>();

    const pyproject = await readTextSafe(join(repoRoot, "pyproject.toml"));
    if (pyproject) {
      for (const name of parsePyprojectScripts(pyproject)) {
        out.set(name, { name, source: this.name });
      }
    }

    const tox = await readTextSafe(join(repoRoot, "tox.ini"));
    if (tox) {
      for (const name of parseToxEnvlist(tox)) {
        if (!out.has(name)) out.set(name, { name, source: this.name });
      }
    }

    return out;
  }
}
