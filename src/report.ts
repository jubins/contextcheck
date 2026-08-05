import pc from "picocolors";
import type { Severity } from "./types.js";
import type { LintResult } from "./lint.js";

/** Honour NO_COLOR and non-TTY output. */
function useColor(): boolean {
  return !process.env.NO_COLOR && process.stdout.isTTY === true;
}

function paint(sev: Severity, text: string): string {
  if (!useColor()) return text;
  if (sev === "error") return pc.red(text);
  if (sev === "warn") return pc.yellow(text);
  return pc.blue(text);
}

const RANK: Record<Severity, number> = { error: 3, warn: 2, info: 1 };

/** Render lint results as human-readable text. */
export function renderHuman(results: LintResult[]): string {
  const out: string[] = [];
  for (const result of results) {
    const { findings } = result;
    const noun = findings.length === 1 ? "issue" : "issues";
    out.push(
      `${pc.bold ? (useColor() ? pc.bold(result.file) : result.file) : result.file} — ${findings.length} ${noun}`,
    );
    if (findings.length === 0) {
      out.push("  no problems found");
      out.push("");
      continue;
    }
    out.push("");
    for (const f of findings) {
      const label = paint(f.severity, f.severity.padEnd(5));
      const loc = `line ${f.line}`.padEnd(9);
      out.push(` ${label}  ${loc}  ${f.message}`);
      if (f.suggestion) {
        out.push(`${" ".repeat(19)}${f.suggestion}`);
      }
    }
    out.push("");
  }
  return out.join("\n");
}

/** Machine-readable JSON with a stable shape. */
export function renderJson(results: LintResult[]): string {
  return JSON.stringify(
    {
      version: 1,
      results: results.map((r) => ({
        file: r.file,
        findings: r.findings,
      })),
    },
    null,
    2,
  );
}

/** Highest severity across all findings, or undefined if none. */
export function worstSeverity(results: LintResult[]): Severity | undefined {
  let worst: Severity | undefined;
  for (const r of results) {
    for (const f of r.findings) {
      if (!worst || RANK[f.severity] > RANK[worst]) worst = f.severity;
    }
  }
  return worst;
}

export { RANK as SEVERITY_RANK };
