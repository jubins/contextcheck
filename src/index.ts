export type {
  Claim,
  ClaimKind,
  ClaimContext,
  Confidence,
  Finding,
  Severity,
} from "./types.js";

export { extractClaims } from "./extract/index.js";

/** Package version, kept in sync with package.json manually for now. */
export const VERSION = "0.1.0";
