import { join } from "node:path";
import { readTextSafe, pathExists } from "./resolve/fs-utils.js";
import type { Severity } from "./types.js";
import type { RuleConfig } from "./checks/index.js";

/**
 * Repo-level configuration loaded from `.contextcheckrc.json` at the repo root.
 * All fields optional.
 */
export interface ContextCheckConfig {
  /** Per-rule enable/disable. `false` disables the rule. */
  rules?: RuleConfig;
  /** Per-rule severity overrides, e.g. { "oversized": "info" }. */
  severity?: Record<string, Severity>;
  /**
   * Glob-ish substrings; a finding whose file path contains any of these is
   * dropped. Kept simple (substring match) to avoid a glob dependency.
   */
  ignore?: string[];
}

const CONFIG_NAMES = [".contextcheckrc.json", ".contextcheckrc"];

/** Load and parse config from the repo root, or an empty config if absent. */
export async function loadConfig(
  repoRoot: string,
): Promise<ContextCheckConfig> {
  for (const name of CONFIG_NAMES) {
    const p = join(repoRoot, name);
    if (!(await pathExists(p))) continue;
    const raw = await readTextSafe(p);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as ContextCheckConfig;
      return normalizeConfig(parsed);
    } catch {
      // Malformed config is ignored rather than crashing the run.
      return {};
    }
  }
  return {};
}

/** Keep only the fields we understand, with basic type guards. */
function normalizeConfig(input: ContextCheckConfig): ContextCheckConfig {
  const out: ContextCheckConfig = {};
  if (input.rules && typeof input.rules === "object") out.rules = input.rules;
  if (input.severity && typeof input.severity === "object") {
    out.severity = input.severity;
  }
  if (Array.isArray(input.ignore)) {
    out.ignore = input.ignore.filter((s) => typeof s === "string");
  }
  return out;
}

/** Merge CLI-provided rule overrides on top of config rules (CLI wins). */
export function mergeRules(
  configRules: RuleConfig | undefined,
  cliRules: RuleConfig | undefined,
): RuleConfig | undefined {
  if (!configRules && !cliRules) return undefined;
  return { ...configRules, ...cliRules };
}
