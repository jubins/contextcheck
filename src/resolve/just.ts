import { join } from "node:path";
import type { Resolver, TaskInfo } from "./types.js";
import { pathExists, readTextSafe } from "./fs-utils.js";

const JUSTFILE_NAMES = ["justfile", "Justfile", ".justfile"];

async function readJustfile(repoRoot: string): Promise<string | undefined> {
  for (const name of JUSTFILE_NAMES) {
    const p = join(repoRoot, name);
    if (await pathExists(p)) {
      return readTextSafe(p);
    }
  }
  return undefined;
}

/**
 * Parse recipe names from a justfile. A recipe header is a non-indented line
 * `name args...:` (optionally with dependencies after the colon). We skip:
 * - indented lines (recipe bodies)
 * - variable assignments (`name := value`)
 * - settings (`set shell := ...`) and comments
 * - `[attribute]` lines
 */
export function parseJustfileRecipes(text: string): string[] {
  const recipes: string[] = [];
  for (const rawLine of text.split("\n")) {
    // Recipe bodies are indented (space or tab).
    if (/^\s/.test(rawLine)) continue;
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith("[")) {
      continue;
    }
    // Assignment `name := value` — not a recipe.
    if (/^\S+\s*:=/.test(line)) continue;
    // `set ...` directives.
    if (/^set\s+/.test(line)) continue;

    // Recipe header: name, optional params, then ':' (not ':=').
    const m = line.match(/^@?([a-zA-Z0-9_][a-zA-Z0-9_-]*)(?:\s+[^:]*)?:(?!=)/);
    const name = m?.[1];
    if (name) recipes.push(name);
  }
  return recipes;
}

export class JustResolver implements Resolver {
  readonly name = "just";

  async detect(repoRoot: string): Promise<boolean> {
    return (await readJustfile(repoRoot)) !== undefined;
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const text = await readJustfile(repoRoot);
    const out = new Map<string, TaskInfo>();
    if (!text) return out;
    for (const name of parseJustfileRecipes(text)) {
      out.set(name, { name, source: this.name });
    }
    return out;
  }
}
