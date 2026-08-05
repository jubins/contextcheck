import { join } from "node:path";
import { readTextSafe } from "./fs-utils.js";
import { KNOWN_TOOLS } from "../extract/patterns.js";

/**
 * Detect which known developer tools a repo actually depends on, by scanning
 * manifest files for their names. Conservative: only reports tools from our
 * curated list, and only when they appear as a dependency key (npm) or a
 * recognizable token (pyproject). Returns a lowercased set.
 */
export async function detectTools(repoRoot: string): Promise<Set<string>> {
  const found = new Set<string>();

  // npm: dependencies + devDependencies keys.
  const pkgRaw = await readTextSafe(join(repoRoot, "package.json"));
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const dep of [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ]) {
        const name = dep.replace(/^@[^/]+\//, "").toLowerCase();
        if (KNOWN_TOOLS.has(name)) found.add(name);
      }
    } catch {
      // Malformed package.json — skip tool detection for it.
    }
  }

  // Python: scan pyproject.toml and tox.ini text for tool names as whole words.
  for (const file of ["pyproject.toml", "tox.ini", "requirements.txt"]) {
    const text = await readTextSafe(join(repoRoot, file));
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const tool of KNOWN_TOOLS) {
      // Word-boundary match to avoid substrings (e.g. "ava" inside "javadoc").
      if (new RegExp(`\\b${tool}\\b`).test(lower)) found.add(tool);
    }
  }

  return found;
}
