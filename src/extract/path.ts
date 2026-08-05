import { PATH_EXTENSIONS, KNOWN_FILENAMES } from "./patterns.js";

export interface PathAssessment {
  /** Whether the token should be treated as a path claim at all. */
  isPath: boolean;
  /** `low` for globs and other heuristic guesses. */
  confidence: "high" | "low";
  /** The token stripped of trailing punctuation. */
  value: string;
}

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCOPED_PKG_RE = /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-._~]+$/i;
const GLOB_CHARS = /[*?[\]{}]|\*\*/;
/** A path separator that is not part of a URL scheme. */
const HAS_SEPARATOR = /[/\\]/;
const TRAILING_PUNCT = /[.,;:!?)\]'"]+$/;
const LEADING_PUNCT = /^[('"]+/;

/** Extract the file extension (without dot), or "" if none. */
function extensionOf(token: string): string {
  const base = token.split(/[/\\]/).pop() ?? token;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Decide whether a bare token is a path claim. Conservative by design:
 * URLs, scoped npm packages, and version-like tokens are excluded; globs are
 * kept but marked low-confidence.
 */
export function assessPath(rawToken: string): PathAssessment {
  const value = rawToken.replace(LEADING_PUNCT, "").replace(TRAILING_PUNCT, "");
  const miss: PathAssessment = { isPath: false, confidence: "low", value };

  if (value.length === 0) return miss;
  if (URL_RE.test(value)) return miss;
  if (SCOPED_PKG_RE.test(value)) return miss;
  // Protocol-relative or bare-domain-looking tokens.
  if (value.startsWith("//")) return miss;

  const hasGlob = GLOB_CHARS.test(value);
  const hasSep = HAS_SEPARATOR.test(value);
  const ext = extensionOf(value);
  const known = KNOWN_FILENAMES.has(value.split(/[/\\]/).pop() ?? value);

  if (hasGlob) {
    // A glob still needs to look pathy (separator or known extension) to count.
    if (hasSep || (ext && PATH_EXTENSIONS.has(ext)) || known) {
      return { isPath: true, confidence: "low", value };
    }
    return miss;
  }

  if (hasSep) return { isPath: true, confidence: "high", value };
  if (ext && PATH_EXTENSIONS.has(ext)) {
    return { isPath: true, confidence: "high", value };
  }
  if (known) return { isPath: true, confidence: "high", value };

  return miss;
}
