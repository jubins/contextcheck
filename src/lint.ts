import { readFile } from "node:fs/promises";
import type { Finding } from "./types.js";
import { extractClaims } from "./extract/index.js";
import { NpmFamilyResolver, detectPackageManager } from "./resolve/npm.js";
import { PathResolver } from "./resolve/path.js";
import type { Resolver, TaskInfo } from "./resolve/types.js";
import { runChecks, type CheckContext, type RuleConfig } from "./checks/index.js";

export interface LintOptions {
  /** Rule enable/disable map. Absent rules default to enabled. */
  rules?: RuleConfig;
}

export interface LintResult {
  /** Absolute or relative path of the linted context file. */
  file: string;
  findings: Finding[];
}

/** Resolvers we try, in order. Only those that `detect()` are used. */
const ALL_RESOLVERS: Resolver[] = [new NpmFamilyResolver()];

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
  return {
    repoRoot,
    resolvers,
    tasks,
    pathResolver: new PathResolver(repoRoot),
    packageManager,
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
  const findings = await runChecks(claims, ctx, options.rules);
  return { file, findings };
}

/** Lint a context file read from disk. */
export async function lintFile(
  filePath: string,
  repoRoot: string,
  options: LintOptions = {},
): Promise<LintResult> {
  const source = await readFile(filePath, "utf8");
  return lintSource(source, repoRoot, filePath, options);
}
