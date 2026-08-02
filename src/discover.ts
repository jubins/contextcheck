import { access } from "node:fs/promises";
import { join, dirname } from "node:path";

/** Filenames we treat as agent context files. */
export const CONTEXT_FILENAMES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
];

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Which known context files exist directly under `dir`. */
export async function findContextFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const name of CONTEXT_FILENAMES) {
    const p = join(dir, name);
    if (await exists(p)) found.push(p);
  }
  return found;
}

/**
 * Walk up from `start` looking for a repo root marker (.git or a manifest).
 * Falls back to `start` when nothing is found, so we never crash.
 */
export async function findRepoRoot(start: string): Promise<string> {
  const markers = [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod"];
  let dir = start;
  for (;;) {
    for (const marker of markers) {
      if (await exists(join(dir, marker))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}
