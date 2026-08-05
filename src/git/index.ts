import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { relative, isAbsolute } from "node:path";

const exec = promisify(execFile);

/** Manifest files whose changes tend to invalidate context-file claims. */
const MANIFEST_NAMES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "pyproject.toml",
  "tox.ini",
  "Cargo.toml",
  "go.mod",
  "Makefile",
  "makefile",
  "GNUmakefile",
  "justfile",
  "Justfile",
  "Taskfile.yml",
  "Taskfile.yaml",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
]);

export interface StalenessInfo {
  /** Commits to the repo since the context file was last modified. */
  commitsSince: number;
  /** Of those, commits that touched a manifest file (the sharper signal). */
  manifestCommitsSince: number;
  /** ISO date of the context file's last modification, if known. */
  lastModified?: string;
}

/** Run git read-only in `repoRoot`; resolves to trimmed stdout or null. */
async function git(repoRoot: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", args, {
      cwd: repoRoot,
      // Guard against pathological repos / hangs.
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** Is `repoRoot` inside a git work tree? */
async function isGitRepo(repoRoot: string): Promise<boolean> {
  const out = await git(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  return out === "true";
}

/**
 * Compute staleness for a context file. Returns null when it can't be
 * determined (not a git repo, git absent, shallow clone with no history,
 * file never committed, ...). Never throws.
 */
export async function computeStaleness(
  repoRoot: string,
  contextFile: string,
): Promise<StalenessInfo | null> {
  if (!(await isGitRepo(repoRoot))) return null;

  const rel = isAbsolute(contextFile)
    ? relative(repoRoot, contextFile)
    : contextFile;

  // The last commit that touched the context file.
  const lastCommit = await git(repoRoot, [
    "log",
    "-1",
    "--format=%H%x09%cI",
    "--",
    rel,
  ]);
  if (!lastCommit) return null; // never committed, or no history
  const [sha, lastModified] = lastCommit.split("\t");
  if (!sha) return null;

  // Total commits since (exclusive of) that commit, on HEAD.
  const countOut = await git(repoRoot, [
    "rev-list",
    "--count",
    `${sha}..HEAD`,
  ]);
  const commitsSince = countOut ? Number.parseInt(countOut, 10) : 0;
  if (!Number.isFinite(commitsSince)) return null;

  // Of those, how many touched a manifest? One `git log` over the range,
  // limited to manifest pathspecs, counting the commits it reports.
  let manifestCommitsSince = 0;
  if (commitsSince > 0) {
    const pathspecs = [...MANIFEST_NAMES].flatMap((name) => [
      name, // at repo root
      `**/${name}`, // anywhere nested
    ]);
    const out = await git(repoRoot, [
      "log",
      "--format=%H",
      `${sha}..HEAD`,
      "--",
      ...pathspecs,
    ]);
    if (out) {
      manifestCommitsSince = out.split("\n").filter(Boolean).length;
    }
  }

  return {
    commitsSince,
    manifestCommitsSince,
    lastModified: lastModified || undefined,
  };
}
