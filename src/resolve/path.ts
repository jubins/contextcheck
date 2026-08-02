import { lstat, readdir, realpath } from "node:fs/promises";
import { join, dirname, basename, isAbsolute, normalize, sep } from "node:path";

export type PathStatus =
  | "exists" // present on disk with matching case
  | "case-mismatch" // present but with different casing (breaks Linux CI)
  | "missing"; // not present at all

export interface PathResolution {
  status: PathStatus;
  /** True when the resolved entry is a symlink. */
  symlink: boolean;
  /** For case-mismatch, the actual on-disk name of the differing segment. */
  actual?: string;
}

/**
 * Resolve a repo-relative path claim against the filesystem, walking segment
 * by segment so we can distinguish a true miss from a case-only mismatch.
 *
 * Globs and Windows-style separators are normalized to the host separator;
 * callers should only pass paths they already deem high-enough confidence.
 */
export class PathResolver {
  constructor(private readonly repoRoot: string) {}

  async resolve(rawPath: string): Promise<PathResolution> {
    // Normalize separators (context files may use Windows-style backslashes)
    // and strip a leading "./".
    let rel = rawPath.replace(/\\/g, "/").replace(/^\.\//, "");
    // Drop a trailing slash used to denote directories.
    rel = rel.replace(/\/+$/, "");
    if (rel === "" || isAbsolute(rel)) {
      return { status: "missing", symlink: false };
    }

    const segments = normalize(rel).split(sep).filter((s) => s.length > 0);
    let current = this.repoRoot;
    let symlink = false;

    for (const segment of segments) {
      let entries: string[];
      try {
        entries = await readdir(current);
      } catch {
        return { status: "missing", symlink };
      }

      if (entries.includes(segment)) {
        current = join(current, segment);
      } else {
        const ciMatch = entries.find(
          (e) => e.toLowerCase() === segment.toLowerCase(),
        );
        if (ciMatch) {
          return { status: "case-mismatch", symlink, actual: ciMatch };
        }
        return { status: "missing", symlink };
      }

      // Track whether any segment along the way is a symlink.
      try {
        const st = await lstat(current);
        if (st.isSymbolicLink()) {
          symlink = true;
          // Follow the link for continued traversal.
          current = await realpath(current);
        }
      } catch {
        return { status: "missing", symlink };
      }
    }

    return { status: "exists", symlink };
  }
}

/** Convenience: the final path segment, for messages. */
export function lastSegment(p: string): string {
  return basename(p.replace(/\\/g, "/").replace(/\/+$/, ""));
}

/** Convenience: the parent directory of a claim path. */
export function parentDir(p: string): string {
  return dirname(p.replace(/\\/g, "/").replace(/\/+$/, ""));
}
