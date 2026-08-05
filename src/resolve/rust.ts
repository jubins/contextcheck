import { join } from "node:path";
import type { Resolver, TaskInfo } from "./types.js";
import { tomlTableKeys } from "./python.js";
import { pathExists, readTextSafe } from "./fs-utils.js";

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

    if (line.startsWith("[[") && line.includes("]]")) {
      const table = line.slice(2, line.indexOf("]]")).trim();
      inBlock = table === header;
      continue;
    }
    // Any single-bracket table ends the current array-of-tables block.
    if (line.startsWith("[")) {
      inBlock = false;
      continue;
    }
    if (!inBlock) continue;

    const m = line.match(/^name\s*=\s*"([^"]+)"/);
    const name = m?.[1];
    if (name) names.push(name);
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
    return pathExists(join(repoRoot, "Cargo.toml"));
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const out = new Map<string, TaskInfo>();

    const cargo = await readTextSafe(join(repoRoot, "Cargo.toml"));
    if (cargo) {
      for (const name of parseArrayOfTableNames(cargo, "bin")) {
        out.set(name, { name, source: this.name, detail: "bin" });
      }
      for (const name of parseArrayOfTableNames(cargo, "example")) {
        if (!out.has(name)) {
          out.set(name, { name, source: this.name, detail: "example" });
        }
      }
    }

    // Cargo aliases live in .cargo/config.toml (or the older .cargo/config).
    const alias =
      (await readTextSafe(join(repoRoot, ".cargo", "config.toml"))) ??
      (await readTextSafe(join(repoRoot, ".cargo", "config")));
    if (alias) {
      for (const name of parseCargoAliases(alias)) {
        if (!out.has(name)) {
          out.set(name, { name, source: this.name, detail: "alias" });
        }
      }
    }

    return out;
  }
}
