import { Command } from "commander";
import { resolve } from "node:path";
import { VERSION } from "./index.js";
import { lintFile, lintWorkspace, type LintResult } from "./lint.js";
import { findContextFiles, findRepoRoot } from "./discover.js";
import {
  renderHuman,
  renderJson,
  worstSeverity,
  SEVERITY_RANK,
} from "./report.js";
import { renderSarif } from "./sarif.js";
import { explainResults } from "./explain.js";
import type { RuleConfig } from "./checks/index.js";
import type { Severity } from "./types.js";

interface CliOptions {
  format: "human" | "json" | "sarif";
  severityThreshold: Severity;
  recursive?: boolean;
  explain?: boolean;
  only?: string;
  ignore?: string;
}

function buildRuleConfig(opts: CliOptions): RuleConfig | undefined {
  if (opts.only) {
    const keep = new Set(opts.only.split(",").map((s) => s.trim()));
    // Disable everything not listed. We only know rule ids that exist today.
    const all = [
      "stale-command",
      "dead-path",
      "case-mismatch-path",
      "wrong-package-manager",
      "undocumented-task",
      "tool-mismatch",
      "oversized",
      "staleness",
      "cross-file-contradiction",
    ];
    const cfg: RuleConfig = {};
    for (const rule of all) cfg[rule] = keep.has(rule);
    return cfg;
  }
  if (opts.ignore) {
    const cfg: RuleConfig = {};
    for (const rule of opts.ignore.split(",")) cfg[rule.trim()] = false;
    return cfg;
  }
  return undefined;
}

async function runCheck(target: string, opts: CliOptions): Promise<void> {
  const cwd = resolve(process.cwd(), target ?? ".");
  const repoRoot = await findRepoRoot(cwd);
  const rules = buildRuleConfig(opts);

  let results: LintResult[];
  if (opts.recursive) {
    // Monorepo mode: every nested context file, with cross-file checks.
    results = await lintWorkspace(cwd, { rules });
  } else {
    const files = await findContextFiles(cwd);
    if (files.length === 0) {
      process.stderr.write(
        `No context files (AGENTS.md, CLAUDE.md, ...) found in ${cwd}\n`,
      );
      process.exitCode = 0;
      return;
    }
    results = [];
    for (const file of files) {
      results.push(await lintFile(file, repoRoot, { rules }));
    }
  }

  if (opts.recursive && results.length === 0) {
    process.stderr.write(`No context files found under ${cwd}\n`);
    process.exitCode = 0;
    return;
  }

  if (opts.format === "json") {
    process.stdout.write(renderJson(results) + "\n");
  } else if (opts.format === "sarif") {
    process.stdout.write(renderSarif(results, repoRoot) + "\n");
  } else {
    process.stdout.write(renderHuman(results));
  }

  // Optional LLM tier: propose diffs for the findings already reported.
  if (opts.explain) {
    await runExplain(results);
  }

  // Exit non-zero when any finding meets or exceeds the threshold.
  const worst = worstSeverity(results);
  if (worst && SEVERITY_RANK[worst] >= SEVERITY_RANK[opts.severityThreshold]) {
    process.exitCode = 1;
  }
}

/** Print suggested-fix diffs for findings. Never writes to disk. */
async function runExplain(results: LintResult[]): Promise<void> {
  try {
    const explanations = await explainResults(results);
    for (const ex of explanations) {
      process.stdout.write(`\n--- explain: ${ex.file} ---\n`);
      if (ex.error) process.stdout.write(`  (skipped: ${ex.error})\n`);
      else if (!ex.diff) process.stdout.write("  (no fix proposed)\n");
      else process.stdout.write(ex.diff + "\n");
    }
    process.stdout.write(
      "\nReview the diffs above and apply them yourself; --explain never edits files.\n",
    );
  } catch (err) {
    process.stderr.write(
      `--explain failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

const program = new Command();
program
  .name("contextcheck")
  .description(
    "Lint AI agent context files (AGENTS.md, CLAUDE.md) against the repository.",
  )
  .version(VERSION);

program
  .argument("[path]", "directory to check", ".")
  .option("-f, --format <format>", "output format: human | json | sarif", "human")
  .option(
    "-t, --severity-threshold <level>",
    "severity that causes a non-zero exit: error | warn | info",
    "error",
  )
  .option("-r, --recursive", "recursively lint nested context files (monorepo mode)")
  .option("--explain", "propose LLM fix diffs for findings (opt-in; needs ANTHROPIC_API_KEY)")
  .option("--only <rules>", "comma-separated rule ids to run exclusively")
  .option("--ignore <rules>", "comma-separated rule ids to skip")
  .action(async (path: string, opts: CliOptions) => {
    await runCheck(path, opts);
  });

// `ctxcheck check [path]` as an explicit alias for the default action.
program
  .command("check")
  .argument("[path]", "directory to check", ".")
  .option("-f, --format <format>", "output format: human | json | sarif", "human")
  .option(
    "-t, --severity-threshold <level>",
    "severity that causes a non-zero exit",
    "error",
  )
  .option("-r, --recursive", "recursively lint nested context files (monorepo mode)")
  .option("--explain", "propose LLM fix diffs for findings (opt-in; needs ANTHROPIC_API_KEY)")
  .option("--only <rules>", "comma-separated rule ids to run exclusively")
  .option("--ignore <rules>", "comma-separated rule ids to skip")
  .action(async (path: string, opts: CliOptions) => {
    await runCheck(path, opts);
  });

program.parseAsync(process.argv);
