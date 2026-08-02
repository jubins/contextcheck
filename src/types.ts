/**
 * Core types shared across contextcheck. These are the stable contracts the
 * extractor, resolvers, checkers, and the VS Code extension all depend on.
 */

export type ClaimKind = "command" | "path" | "tool" | "version" | "env-var";

export type ClaimContext = "code-fence" | "inline-code" | "prose" | "heading";

export type Confidence = "high" | "low";

/** A verifiable assertion pulled from a context file. */
export interface Claim {
  kind: ClaimKind;
  /** Exact text as it appeared in the source. */
  raw: string;
  /** Normalized value used for matching against the repo. */
  value: string;
  /** 1-based line number in the source file. */
  line: number;
  /** 1-based column number in the source file. */
  column: number;
  context: ClaimContext;
  /** `low` means a heuristic guess, typically from prose. */
  confidence: Confidence;
}

export type Severity = "error" | "warn" | "info";

/** A single problem discovered by a checker. */
export interface Finding {
  /** Stable rule id, e.g. `stale-command`, `dead-path`. */
  rule: string;
  severity: Severity;
  message: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** Human-facing hint, e.g. "did you mean `build:prod`?". */
  suggestion?: string;
  fixable: boolean;
}
