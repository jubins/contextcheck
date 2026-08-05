import { relative, isAbsolute } from "node:path";
import type { Severity } from "./types.js";
import type { LintResult } from "./lint.js";
import { VERSION } from "./version.js";

/**
 * Minimal SARIF 2.1.0 output. GitHub code scanning ingests this so findings
 * show up in a PR's "Files Changed" tab. We emit one run with a driver that
 * declares each rule that produced a finding, plus a result per finding.
 */

/** SARIF severity levels. `info` maps to "note". */
function sarifLevel(sev: Severity): "error" | "warning" | "note" {
  if (sev === "error") return "error";
  if (sev === "warn") return "warning";
  return "note";
}

interface SarifRule {
  id: string;
  shortDescription: { text: string };
}

/** Human-readable one-liners for each rule id, for the SARIF rule metadata. */
const RULE_DESCRIPTIONS: Record<string, string> = {
  "stale-command": "A command references a task the repository does not define.",
  "dead-path": "A referenced file or directory does not exist.",
  "case-mismatch-path":
    "A path exists but with different casing; breaks case-sensitive filesystems.",
  "wrong-package-manager":
    "A command uses npm while the repository uses a different package manager.",
  "undocumented-task":
    "The repository defines an important task the context file never mentions.",
  "tool-mismatch":
    "The context file names a tool while the repository uses a competitor.",
  oversized: "The context file exceeds the recommended line count.",
};

/** Render lint results as a SARIF 2.1.0 document (pretty-printed JSON). */
export function renderSarif(results: LintResult[], repoRoot: string): string {
  const ruleIds = new Set<string>();
  for (const r of results) for (const f of r.findings) ruleIds.add(f.rule);

  const rules: SarifRule[] = [...ruleIds].sort().map((id) => ({
    id,
    shortDescription: { text: RULE_DESCRIPTIONS[id] ?? id },
  }));

  const sarifResults = results.flatMap((result) => {
    const uri = toRepoRelativeUri(result.file, repoRoot);
    return result.findings.map((f) => ({
      ruleId: f.rule,
      level: sarifLevel(f.severity),
      message: {
        text: f.suggestion ? `${f.message} — ${f.suggestion}` : f.message,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri },
            region: {
              startLine: Math.max(1, f.line),
              startColumn: Math.max(1, f.column),
            },
          },
        },
      ],
    }));
  });

  const doc = {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Context Check",
            informationUri: "https://github.com/jubins/contextcheck",
            version: VERSION,
            rules,
          },
        },
        results: sarifResults,
      },
    ],
  };

  return JSON.stringify(doc, null, 2);
}

/** SARIF wants forward-slash, repo-relative URIs. */
function toRepoRelativeUri(file: string, repoRoot: string): string {
  const rel = isAbsolute(file) ? relative(repoRoot, file) : file;
  return rel.split("\\").join("/");
}
