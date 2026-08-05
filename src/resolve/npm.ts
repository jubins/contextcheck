import { join } from "node:path";
import type { Resolver, TaskInfo, PackageManager } from "./types.js";
import { pathExists, readTextSafe } from "./fs-utils.js";

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
  if (await pathExists(join(repoRoot, "bun.lockb"))) return "bun";
  if (await pathExists(join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (await pathExists(join(repoRoot, "yarn.lock"))) return "yarn";
  if (await pathExists(join(repoRoot, "package-lock.json"))) return "npm";
  return undefined;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

async function readPackageJson(
  repoRoot: string,
): Promise<PackageJson | undefined> {
  const raw = await readTextSafe(join(repoRoot, "package.json"));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PackageJson;
  } catch {
    return undefined;
  }
}

export class NpmFamilyResolver implements Resolver {
  readonly name = "npm-family";

  async detect(repoRoot: string): Promise<boolean> {
    return pathExists(join(repoRoot, "package.json"));
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
