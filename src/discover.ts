import { access, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";

/** Filenames we treat as agent context files. */
export const CONTEXT_FILENAMES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
];

/** Directories we never descend into during recursive discovery. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  "coverage",
  "vendor",
]);

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
 * Recursively discover every context file under `root`, skipping build/vendor
 * directories. Sorted so root-level files come first. Bounded depth to avoid
 * pathological trees.
 */
export async function findAllContextFiles(
  root: string,
  maxDepth = 8,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (depth >= maxDepth || SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".cursor") continue;
        await walk(join(dir, entry.name), depth + 1);
      } else if (CONTEXT_FILENAMES.includes(entry.name)) {
        results.push(join(dir, entry.name));
      }
    }
  }

  await walk(root, 0);
  // Root-level files first, then by path length (shallower before deeper).
  return results.sort((a, b) => a.length - b.length || a.localeCompare(b));
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
