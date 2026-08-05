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

/** The module path from a go.mod's `module` directive, or undefined. */
export function parseGoModule(goMod: string): string | undefined {
  const m = goMod.match(/^\s*module\s+(\S+)/m);
  return m ? m[1] : undefined;
}

/**
 * Go has no built-in task system — `go build` / `go test` are subcommands, not
 * named tasks — so there is nothing script-like to enumerate. This resolver
 * exists to (a) mark a repo as Go and (b) expose the module path for future
 * import/path resolution. Task running in Go repos is typically driven by a
 * Makefile, which the MakefileResolver already covers.
 */
export class GoResolver implements Resolver {
  readonly name = "go";
  private modulePath: string | undefined;

  async detect(repoRoot: string): Promise<boolean> {
    const goMod = join(repoRoot, "go.mod");
    if (!(await exists(goMod))) return false;
    try {
      this.modulePath = parseGoModule(await readFile(goMod, "utf8"));
    } catch {
      this.modulePath = undefined;
    }
    return true;
  }

  /** Go exposes no named tasks; returns an empty map by design. */
  async tasks(): Promise<Map<string, TaskInfo>> {
    return new Map();
  }

  /** The module path, available after detect(). */
  getModulePath(): string | undefined {
    return this.modulePath;
  }
}
