import type { Claim, Finding } from "../types.js";
import type { Resolver, TaskInfo, PackageManager } from "../resolve/types.js";
import { PathResolver } from "../resolve/path.js";
import { closestMatch } from "./levenshtein.js";
import { commandTarget } from "./command-target.js";

/** Everything a checker needs about the repo, gathered once. */
export interface CheckContext {
  repoRoot: string;
  /** Task resolvers that applied to this repo (already `detect()`ed). */
  resolvers: Resolver[];
  /** Union of all tasks across applicable resolvers, keyed by name. */
  tasks: Map<string, TaskInfo>;
  pathResolver: PathResolver;
  /** Package manager detected from the lockfile, if any. */
  packageManager?: PackageManager;
}

/** Which rules are enabled. Absent = enabled. */
export type RuleConfig = Record<string, boolean>;

function enabled(config: RuleConfig | undefined, rule: string): boolean {
  return config?.[rule] !== false;
}

/**
 * The `stale-command` checker: a command claim names a task the repo doesn't
 * define. Suggests the closest real task within 3 edits.
 */
export function checkStaleCommand(
  claims: Claim[],
  ctx: CheckContext,
): Finding[] {
  const findings: Finding[] = [];
  for (const claim of claims) {
    if (claim.kind !== "command") continue;
    const target = commandTarget(claim.value);
    if (!target) continue; // not a verifiable task invocation
    if (ctx.tasks.has(target.task)) continue; // matches something real

    // Only flag when we actually have a task list to compare against; an
    // empty repo shouldn't produce noise.
    if (ctx.tasks.size === 0) continue;

    const suggestion = closestMatch(target.task, ctx.tasks.keys(), 3);
    findings.push({
      rule: "stale-command",
      severity: "error",
      message: `command \`${claim.value}\` not found (no \`${target.task}\` task in the repo)`,
      line: claim.line,
      column: claim.column,
      suggestion: suggestion ? `did you mean \`${suggestion}\`?` : undefined,
      fixable: suggestion !== undefined,
    });
  }
  return findings;
}

/**
 * The `dead-path` checker: a path claim references a file/dir that doesn't
 * exist. Error at high confidence, warn at low. Case mismatches are reported
 * separately (they break Linux CI) as `case-mismatch-path`.
 */
export async function checkDeadPath(
  claims: Claim[],
  ctx: CheckContext,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const claim of claims) {
    if (claim.kind !== "path") continue;
    const res = await ctx.pathResolver.resolve(claim.value);
    if (res.status === "exists") continue;

    if (res.status === "case-mismatch") {
      findings.push({
        rule: "case-mismatch-path",
        severity: "error",
        message: `path \`${claim.value}\` exists with different casing; this breaks case-sensitive (Linux) CI`,
        line: claim.line,
        column: claim.column,
        suggestion: res.corrected
          ? `did you mean \`${res.corrected}\`?`
          : res.actual
            ? `on disk as \`${res.actual}\``
            : undefined,
        fixable: res.corrected !== undefined,
      });
      continue;
    }

    // status === "missing"
    findings.push({
      rule: "dead-path",
      severity: claim.confidence === "high" ? "error" : "warn",
      message: `path \`${claim.value}\` does not exist`,
      line: claim.line,
      column: claim.column,
      fixable: false,
    });
  }
  return findings;
}

/** Tasks the context file really ought to mention if the repo defines them. */
const IMPORTANT_TASKS = ["test", "build", "lint", "typecheck", "dev"];

/**
 * The `wrong-package-manager` checker: a command uses `npm` while the repo's
 * lockfile indicates a different package manager (pnpm/yarn/bun). Info only —
 * `npm run x` often still works, but the docs should match the real tool.
 */
export function checkWrongPackageManager(
  claims: Claim[],
  ctx: CheckContext,
): Finding[] {
  const pm = ctx.packageManager;
  if (!pm || pm === "npm") return [];
  const findings: Finding[] = [];
  for (const claim of claims) {
    if (claim.kind !== "command") continue;
    // Only flag npm invocations; other runners are unrelated.
    if (!/^npm(\s|$)/.test(claim.value)) continue;
    findings.push({
      rule: "wrong-package-manager",
      severity: "info",
      message: `command uses \`npm\` but this repo's lockfile indicates ${pm}`,
      line: claim.line,
      column: claim.column,
      suggestion: `use \`${pm}\` to match the repo`,
      fixable: false,
    });
  }
  return findings;
}

/**
 * The `undocumented-task` checker (runs the check backwards): the repo defines
 * an important task that no command in the context file mentions. Info only.
 * Reported once per undocumented task, anchored at the top of the file.
 */
export function checkUndocumentedTask(
  claims: Claim[],
  ctx: CheckContext,
): Finding[] {
  if (ctx.tasks.size === 0) return [];
  // Which tasks does the context file actually reference?
  const documented = new Set<string>();
  for (const claim of claims) {
    if (claim.kind !== "command") continue;
    const target = commandTarget(claim.value);
    if (target) documented.add(target.task);
  }

  const findings: Finding[] = [];
  for (const task of IMPORTANT_TASKS) {
    if (ctx.tasks.has(task) && !documented.has(task)) {
      findings.push({
        rule: "undocumented-task",
        severity: "info",
        message: `repo defines a \`${task}\` task that the context file never mentions`,
        line: 1,
        column: 1,
        suggestion: `document how to run \`${task}\``,
        fixable: false,
      });
    }
  }
  return findings;
}

/** Run all enabled checkers and return findings sorted by line then column. */
export async function runChecks(
  claims: Claim[],
  ctx: CheckContext,
  config?: RuleConfig,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (enabled(config, "stale-command")) {
    findings.push(...checkStaleCommand(claims, ctx));
  }
  if (enabled(config, "dead-path") || enabled(config, "case-mismatch-path")) {
    const pathFindings = await checkDeadPath(claims, ctx);
    findings.push(
      ...pathFindings.filter((f) => enabled(config, f.rule)),
    );
  }
  if (enabled(config, "wrong-package-manager")) {
    findings.push(...checkWrongPackageManager(claims, ctx));
  }
  if (enabled(config, "undocumented-task")) {
    findings.push(...checkUndocumentedTask(claims, ctx));
  }
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings;
}

export { levenshtein, closestMatch } from "./levenshtein.js";
export { commandTarget } from "./command-target.js";
