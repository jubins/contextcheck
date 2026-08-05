import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { Resolver, TaskInfo } from "./types.js";
import { tomlTableKeys } from "./python.js";

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
 * Collect the `name = "..."` values from every array-of-tables block whose
 * header matches `header` (e.g. `[[bin]]`, `[[example]]`). Cargo uses these to
 * declare additional binaries and examples.
 */
export function parseArrayOfTableNames(toml: string, header: string): string[] {
  const names: string[] = [];
  let inBlock = false;
  for (const rawLine of toml.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const aot = line.match(/^\[\[([^[\]]+)\]\]/);
    if (aot) {
      inBlock = aot[1]!.trim() === header;
      continue;
    }
    // Any single-bracket table ends the current array-of-tables block.
    if (/^\[[^[]/.test(line)) {
      inBlock = false;
      continue;
    }
    if (!inBlock) continue;

    const m = line.match(/^name\s*=\s*"([^"]+)"/);
    if (m) names.push(m[1]!);
  }
  return names;
}

/** Custom subcommand aliases from `.cargo/config.toml` `[alias]`. */
export function parseCargoAliases(configToml: string): string[] {
  return tomlTableKeys(configToml, (t) => t === "alias");
}

export class RustResolver implements Resolver {
  readonly name = "rust";

  async detect(repoRoot: string): Promise<boolean> {
    return exists(join(repoRoot, "Cargo.toml"));
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const out = new Map<string, TaskInfo>();

    const cargo = await readFileSafe(join(repoRoot, "Cargo.toml"));
    if (cargo) {
      for (const name of parseArrayOfTableNames(cargo, "bin")) {
        out.set(name, { name, source: this.name, detail: "bin" });
      }
      for (const name of parseArrayOfTableNames(cargo, "example")) {
        if (!out.has(name)) out.set(name, { name, source: this.name, detail: "example" });
      }
    }

    // Cargo aliases live in .cargo/config.toml (or the older .cargo/config).
    const alias =
      (await readFileSafe(join(repoRoot, ".cargo", "config.toml"))) ??
      (await readFileSafe(join(repoRoot, ".cargo", "config")));
    if (alias) {
      for (const name of parseCargoAliases(alias)) {
        if (!out.has(name)) out.set(name, { name, source: this.name, detail: "alias" });
      }
    }

    return out;
  }
}
