export type {
  Claim,
  ClaimKind,
  ClaimContext,
  Confidence,
  Finding,
  Severity,
} from "./types.js";

export { extractClaims } from "./extract/index.js";
export {
  NpmFamilyResolver,
  PathResolver,
  detectPackageManager,
  lastSegment,
  parentDir,
  type Resolver,
  type TaskInfo,
  type PackageManager,
  type PathStatus,
  type PathResolution,
} from "./resolve/index.js";

export {
  runChecks,
  checkStaleCommand,
  checkDeadPath,
  checkWrongPackageManager,
  checkUndocumentedTask,
  levenshtein,
  closestMatch,
  commandTarget,
  type CheckContext,
  type RuleConfig,
} from "./checks/index.js";

export {
  lintSource,
  lintFile,
  buildContext,
  type LintOptions,
  type LintResult,
} from "./lint.js";

export {
  findContextFiles,
  findRepoRoot,
  CONTEXT_FILENAMES,
} from "./discover.js";

export {
  renderHuman,
  renderJson,
  worstSeverity,
} from "./report.js";

/** Package version, kept in sync with package.json manually for now. */
export const VERSION = "0.1.0";
