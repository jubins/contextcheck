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
  MakefileResolver,
  PythonResolver,
  RustResolver,
  GoResolver,
  JustResolver,
  TaskResolver,
  JvmResolver,
  PathResolver,
  detectTools,
  detectPackageManager,
  parseMakefileTargets,
  parsePyprojectScripts,
  parseToxEnvlist,
  parseArrayOfTableNames,
  parseCargoAliases,
  parseGoModule,
  parseJustfileRecipes,
  parseTaskfileTasks,
  parseGradleTasks,
  parseMavenProfiles,
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
  checkToolMismatch,
  checkOversized,
  checkStaleness,
  levenshtein,
  closestMatch,
  commandTarget,
  type CheckContext,
  type RuleConfig,
} from "./checks/index.js";

export {
  lintSource,
  lintFile,
  lintWorkspace,
  buildContext,
  type LintOptions,
  type LintResult,
} from "./lint.js";

export {
  checkCrossFileContradictions,
  type ContextFileInput,
} from "./checks/cross-file.js";

export {
  findContextFiles,
  findAllContextFiles,
  findRepoRoot,
  CONTEXT_FILENAMES,
} from "./discover.js";

export {
  renderHuman,
  renderJson,
  worstSeverity,
} from "./report.js";

export { renderSarif } from "./sarif.js";

export {
  computeStaleness,
  type StalenessInfo,
} from "./git/index.js";

export {
  loadConfig,
  mergeRules,
  type ContextCheckConfig,
} from "./config.js";

export { VERSION } from "./version.js";
