import { Command } from "commander";
import { resolve } from "node:path";
import { VERSION } from "./index.js";
import { lintFile, type LintResult } from "./lint.js";
import { findContextFiles, findRepoRoot } from "./discover.js";
import {
  renderHuman,
  renderJson,
  worstSeverity,
  SEVERITY_RANK,
} from "./report.js";
import type { RuleConfig } from "./checks/index.js";
import type { Severity } from "./types.js";

interface CliOptions {
  format: "human" | "json";
  severityThreshold: Severity;
  only?: string;
  ignore?: string;
}

function buildRuleConfig(opts: CliOptions): RuleConfig | undefined {
  if (opts.only) {
    const keep = new Set(opts.only.split(",").map((s) => s.trim()));
    // Disable everything not listed. We only know rule ids that exist today.
    const all = ["stale-command", "dead-path", "case-mismatch-path"];
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
  const files = await findContextFiles(cwd);

  if (files.length === 0) {
    process.stderr.write(
      `No context files (AGENTS.md, CLAUDE.md, ...) found in ${cwd}\n`,
    );
    process.exitCode = 0;
    return;
  }

  const rules = buildRuleConfig(opts);
  const results: LintResult[] = [];
  for (const file of files) {
    results.push(await lintFile(file, repoRoot, { rules }));
  }

  if (opts.format === "json") {
    process.stdout.write(renderJson(results) + "\n");
  } else {
    process.stdout.write(renderHuman(results));
  }

  // Exit non-zero when any finding meets or exceeds the threshold.
  const worst = worstSeverity(results);
  if (worst && SEVERITY_RANK[worst] >= SEVERITY_RANK[opts.severityThreshold]) {
    process.exitCode = 1;
  }
}

const program = new Command();
program
  .name("ctxcheck")
  .description(
    "Lint AI agent context files (AGENTS.md, CLAUDE.md) against the repository.",
  )
  .version(VERSION);

program
  .argument("[path]", "directory to check", ".")
  .option("-f, --format <format>", "output format: human | json", "human")
  .option(
    "-t, --severity-threshold <level>",
    "severity that causes a non-zero exit: error | warn | info",
    "error",
  )
  .option("--only <rules>", "comma-separated rule ids to run exclusively")
  .option("--ignore <rules>", "comma-separated rule ids to skip")
  .action(async (path: string, opts: CliOptions) => {
    await runCheck(path, opts);
  });

// `ctxcheck check [path]` as an explicit alias for the default action.
program
  .command("check")
  .argument("[path]", "directory to check", ".")
  .option("-f, --format <format>", "output format: human | json", "human")
  .option(
    "-t, --severity-threshold <level>",
    "severity that causes a non-zero exit",
    "error",
  )
  .option("--only <rules>", "comma-separated rule ids to run exclusively")
  .option("--ignore <rules>", "comma-separated rule ids to skip")
  .action(async (path: string, opts: CliOptions) => {
    await runCheck(path, opts);
  });

program.parseAsync(process.argv);
