/**
 * Given a normalized command claim, work out which resolver "task name" it is
 * asking to run — the thing we match against package.json scripts, Makefile
 * targets, etc. Returns undefined for commands that don't name a task we can
 * verify (e.g. `npm install`, `go build`), so the checker stays silent rather
 * than crying wolf.
 */

export interface CommandTarget {
  /** The task/script name to look up, e.g. "build" from `npm run build`. */
  task: string;
  /** The runner the command used, for messages. */
  runner: string;
}

/** Package-manager run invocations: `npm run X`, `pnpm X`, `yarn X`, etc. */
const PM_RUN = new Set(["npm", "pnpm", "yarn", "bun"]);

/**
 * Subcommands that are the package manager's own verbs, not user scripts.
 * Used to avoid treating `npm install` as a missing "install" script.
 */
const PM_BUILTINS = new Set([
  "install",
  "i",
  "ci",
  "add",
  "remove",
  "run",
  "exec",
  "test",
  "start",
  "publish",
  "update",
  "outdated",
  "link",
  "init",
  "dlx",
  "create",
]);

export function commandTarget(normalized: string): CommandTarget | undefined {
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return undefined;
  const runner = tokens[0]!;

  if (PM_RUN.has(runner)) {
    // `npm run build` / `pnpm run build`
    if (tokens[1] === "run" && tokens[2]) {
      return { task: tokens[2], runner };
    }
    // `yarn build` / `pnpm build` — direct script invocation, but only when
    // the second token is not a package-manager builtin.
    if (tokens[1] && !PM_BUILTINS.has(tokens[1]) && runner !== "npm") {
      return { task: tokens[1], runner };
    }
    // `npm test` / `yarn test` map to the "test" script by convention.
    if (tokens[1] === "test" || tokens[1] === "start") {
      return { task: tokens[1], runner };
    }
    return undefined;
  }

  if (runner === "make" && tokens[1]) {
    return { task: tokens[1], runner };
  }
  if ((runner === "just" || runner === "task") && tokens[1]) {
    return { task: tokens[1], runner };
  }

  // Python task runners.
  // `poetry run X` / `uv run X` → script/task X (skip poetry's own verbs).
  if ((runner === "poetry" || runner === "uv") && tokens[1] === "run" && tokens[2]) {
    return { task: tokens[2], runner };
  }
  // `tox -e X` → environment X.
  if (runner === "tox") {
    const i = tokens.indexOf("-e");
    if (i >= 0 && tokens[i + 1]) return { task: tokens[i + 1]!, runner };
  }
  // `nox -s X` → session X.
  if (runner === "nox") {
    const i = tokens.indexOf("-s");
    if (i >= 0 && tokens[i + 1]) return { task: tokens[i + 1]!, runner };
  }

  // Other runners (cargo, go, ...) aren't script-name based; skip.
  return undefined;
}
