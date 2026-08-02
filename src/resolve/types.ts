/**
 * Resolver contracts. A resolver answers "does this claim correspond to
 * something real in the repository?" for a given ecosystem (npm, Make, etc.).
 */

/** A task/script the repository actually defines. */
export interface TaskInfo {
  /** Canonical name, e.g. an npm script name or a Makefile target. */
  name: string;
  /** Which resolver produced this, e.g. "npm-family". */
  source: string;
  /** The raw command body, when known (npm script value, etc.). */
  detail?: string;
}

export interface Resolver {
  name: string;
  /** Whether this resolver applies to the repo at `repoRoot`. */
  detect(repoRoot: string): Promise<boolean>;
  /** All runnable tasks the resolver can enumerate, keyed by name. */
  tasks(repoRoot: string): Promise<Map<string, TaskInfo>>;
}

/** Package managers we can distinguish from lockfiles. */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
