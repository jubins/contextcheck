import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { Resolver, TaskInfo, PackageManager } from "./types.js";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the package manager a repo actually uses from its lockfile. Lets us
 * flag `npm run x` in a repo that is really pnpm/yarn/bun. Returns undefined
 * when no lockfile is present (we don't guess from package.json alone).
 */
export async function detectPackageManager(
  repoRoot: string,
): Promise<PackageManager | undefined> {
  // Order matters only for the rare repo with multiple lockfiles; prefer the
  // more specific tools over npm.
  if (await exists(join(repoRoot, "bun.lockb"))) return "bun";
  if (await exists(join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(join(repoRoot, "yarn.lock"))) return "yarn";
  if (await exists(join(repoRoot, "package-lock.json"))) return "npm";
  return undefined;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

async function readPackageJson(
  repoRoot: string,
): Promise<PackageJson | undefined> {
  try {
    const raw = await readFile(join(repoRoot, "package.json"), "utf8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return undefined;
  }
}

export class NpmFamilyResolver implements Resolver {
  readonly name = "npm-family";

  async detect(repoRoot: string): Promise<boolean> {
    return exists(join(repoRoot, "package.json"));
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const pkg = await readPackageJson(repoRoot);
    const out = new Map<string, TaskInfo>();
    if (!pkg?.scripts) return out;
    for (const [scriptName, body] of Object.entries(pkg.scripts)) {
      out.set(scriptName, {
        name: scriptName,
        source: this.name,
        detail: body,
      });
    }
    return out;
  }
}
