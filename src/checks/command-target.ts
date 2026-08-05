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

/** Cargo's own subcommands — not user-defined aliases. */
const CARGO_BUILTINS = new Set([
  "build",
  "b",
  "run",
  "r",
  "test",
  "t",
  "check",
  "c",
  "bench",
  "doc",
  "fmt",
  "clippy",
  "clean",
  "update",
  "install",
  "publish",
  "add",
  "remove",
  "init",
  "new",
]);

/** The token immediately after `flag`, or undefined if absent/at the end. */
function argAfter(tokens: string[], flag: string): string | undefined {
  const i = tokens.indexOf(flag);
  return i >= 0 ? tokens[i + 1] : undefined;
}

export function commandTarget(normalized: string): CommandTarget | undefined {
  const tokens = normalized.split(" ").filter(Boolean);
  const runner = tokens[0];
  if (!runner) return undefined;

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
    const env = argAfter(tokens, "-e");
    if (env) return { task: env, runner };
  }
  // `nox -s X` → session X.
  if (runner === "nox") {
    const session = argAfter(tokens, "-s");
    if (session) return { task: session, runner };
  }

  // Cargo: named bins/examples and custom aliases are verifiable.
  const cargoSub = tokens[1];
  if (runner === "cargo" && cargoSub) {
    const bin = argAfter(tokens, "--bin");
    if (bin) return { task: bin, runner };
    const example = argAfter(tokens, "--example");
    if (example) return { task: example, runner };
    // A non-builtin second token is a custom alias (e.g. `cargo xtask`).
    if (!CARGO_BUILTINS.has(cargoSub)) return { task: cargoSub, runner };
  }

  // Gradle: `gradle <task>` / `./gradlew <task>` — first non-flag token.
  if (runner === "gradle" || runner === "./gradlew" || runner === "gradlew") {
    const task = tokens.slice(1).find((t) => !t.startsWith("-"));
    if (task) return { task, runner: "gradle" };
  }

  // Other runners (go, mvn, ...) aren't reliably script-name based; skip.
  return undefined;
}
