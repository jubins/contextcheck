/**
 * Curated pattern tables used by the claim extractor. Kept deliberately
 * explicit and conservative — false positives are worse than misses.
 */

/** Command runners that mark inline code (and prose tokens) as commands. */
export const KNOWN_RUNNERS = new Set<string>([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "npx",
  "make",
  "cargo",
  "go",
  "poetry",
  "uv",
  "just",
  "task",
  "mvn",
  "gradle",
  "dotnet",
  "pytest",
  "tox",
  "nox",
  "rake",
  "composer",
]);

/** Code-fence languages treated as shell. */
export const SHELL_FENCE_LANGS = new Set<string>([
  "bash",
  "sh",
  "shell",
  "zsh",
  "console",
  "shell-session",
]);

/**
 * Leading tokens that appear in shell fences but are prompts/noise, not the
 * command itself. Stripped before deciding whether a line is a command.
 */
export const SHELL_PROMPT_PREFIXES = ["$", "#", ">", "PS>"];

/**
 * File extensions that make a bare token look like a path even without a
 * directory separator (e.g. `tsconfig.json`, `Makefile` handled separately).
 */
export const PATH_EXTENSIONS = new Set<string>([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "jsonc",
  "yml",
  "yaml",
  "toml",
  "md",
  "mdx",
  "py",
  "rs",
  "go",
  "rb",
  "java",
  "kt",
  "cs",
  "c",
  "h",
  "cpp",
  "hpp",
  "sh",
  "lock",
  "txt",
  "cfg",
  "ini",
  "env",
  "xml",
  "html",
  "css",
  "scss",
  "sql",
  "proto",
  "graphql",
  "gradle",
]);

/** Well-known filenames that are paths even without an extension. */
export const KNOWN_FILENAMES = new Set<string>([
  "Makefile",
  "Dockerfile",
  "Justfile",
  "justfile",
  "Taskfile.yml",
  "Taskfile.yaml",
  "README",
  "LICENSE",
  "AGENTS.md",
  "CLAUDE.md",
]);
