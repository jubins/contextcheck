import { readFile } from "node:fs/promises";
import type { Finding } from "./types.js";
import { extractClaims } from "./extract/index.js";
import { NpmFamilyResolver, detectPackageManager } from "./resolve/npm.js";
import { detectTools } from "./resolve/tools.js";
import { MakefileResolver } from "./resolve/make.js";
import { PythonResolver } from "./resolve/python.js";
import { RustResolver } from "./resolve/rust.js";
import { GoResolver } from "./resolve/go.js";
import { JustResolver } from "./resolve/just.js";
import { TaskResolver } from "./resolve/task.js";
import { JvmResolver } from "./resolve/jvm.js";
import { PathResolver } from "./resolve/path.js";
import type { Resolver, TaskInfo } from "./resolve/types.js";
import { runChecks, type CheckContext, type RuleConfig } from "./checks/index.js";
import { loadConfig, mergeRules } from "./config.js";

export interface LintOptions {
  /** Rule enable/disable map. Absent rules default to enabled. */
  rules?: RuleConfig;
  /** Per-rule severity overrides applied after checks run. */
  severityOverrides?: Record<string, string>;
  /** Drop findings whose file path contains any of these substrings. */
  ignore?: string[];
}

export interface LintResult {
  /** Absolute or relative path of the linted context file. */
  file: string;
  findings: Finding[];
}

/** Resolvers we try, in order. Only those that `detect()` are used. */
const ALL_RESOLVERS: Resolver[] = [
  new NpmFamilyResolver(),
  new MakefileResolver(),
  new PythonResolver(),
  new RustResolver(),
  new GoResolver(),
  new JustResolver(),
  new TaskResolver(),
  new JvmResolver(),
];

/**
 * Build the shared check context for a repo: run applicable resolvers and
 * merge their tasks. Path resolution is rooted at `repoRoot`.
 */
export async function buildContext(repoRoot: string): Promise<CheckContext> {
  const resolvers: Resolver[] = [];
  const tasks = new Map<string, TaskInfo>();
  for (const resolver of ALL_RESOLVERS) {
    if (!(await resolver.detect(repoRoot))) continue;
    resolvers.push(resolver);
    for (const [name, info] of await resolver.tasks(repoRoot)) {
      if (!tasks.has(name)) tasks.set(name, info);
    }
  }
  const packageManager = await detectPackageManager(repoRoot);
  const tools = await detectTools(repoRoot);
  return {
    repoRoot,
    resolvers,
    tasks,
    pathResolver: new PathResolver(repoRoot),
    packageManager,
    tools,
  };
}

/**
 * Lint a single context file's markdown `source` against a repo at
 * `repoRoot`. Pure over its inputs so the VS Code extension can pass unsaved
 * editor text without touching disk.
 */
export async function lintSource(
  source: string,
  repoRoot: string,
  file: string,
  options: LintOptions = {},
): Promise<LintResult> {
  const claims = extractClaims(source);
  const ctx = await buildContext(repoRoot);
  // `source` enables whole-file checks (oversized) without re-reading disk.
  let findings = await runChecks(claims, { ...ctx, source }, options.rules);
  findings = applyOverrides(findings, options);
  // Ignore patterns match the file path, so a match drops all its findings.
  const ignored = options.ignore?.some((pat) => file.includes(pat)) ?? false;
  if (ignored) findings = [];
  return { file, findings };
}

const VALID_SEVERITIES = new Set(["error", "warn", "info"]);

/** Apply per-rule severity overrides from config to the findings. */
function applyOverrides(
  findings: Finding[],
  options: LintOptions,
): Finding[] {
  const overrides = options.severityOverrides;
  if (!overrides) return findings;
  return findings.map((f) => {
    const next = overrides[f.rule];
    if (next && VALID_SEVERITIES.has(next)) {
      return { ...f, severity: next as Finding["severity"] };
    }
    return f;
  });
}

/**
 * Lint a context file read from disk, merging in the repo's
 * `.contextcheckrc.json` (CLI-provided options take precedence).
 */
export async function lintFile(
  filePath: string,
  repoRoot: string,
  options: LintOptions = {},
): Promise<LintResult> {
  const source = await readFile(filePath, "utf8");
  const config = await loadConfig(repoRoot);
  const merged: LintOptions = {
    rules: mergeRules(config.rules, options.rules),
    severityOverrides: { ...config.severity, ...options.severityOverrides },
    ignore: [...(config.ignore ?? []), ...(options.ignore ?? [])],
  };
  return lintSource(source, repoRoot, filePath, merged);
}
