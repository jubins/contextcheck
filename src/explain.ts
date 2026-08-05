import { readFile } from "node:fs/promises";
import type { Finding } from "./types.js";
import type { LintResult } from "./lint.js";

/**
 * Optional LLM tier. Off by default and only ever invoked behind an explicit
 * flag. It runs *only* on findings the deterministic layer already produced —
 * never a freeform "review my file" call — and returns a unified diff the user
 * chooses to apply. It never writes to disk itself.
 *
 * The API key is read from an environment variable (BYOK); there is no pasted-
 * key path. Uses the Anthropic Messages API via fetch (no SDK dependency, so
 * the core stays network-free unless this tier is explicitly used).
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

export interface ExplainOptions {
  /** API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Override the model id. */
  model?: string;
}

export interface ExplainResult {
  file: string;
  /** A unified diff the user can apply, or null if nothing was proposed. */
  diff: string | null;
  /** Present when the call failed; the caller decides how to surface it. */
  error?: string;
}

/** Render the findings for one file into a compact, unambiguous list. */
function formatFindings(findings: Finding[]): string {
  return findings
    .map((f) => {
      const suffix = f.suggestion ? ` — ${f.suggestion}` : "";
      return `- [${f.severity}] line ${f.line}, rule ${f.rule}: ${f.message}${suffix}`;
    })
    .join("\n");
}

function buildPrompt(file: string, source: string, findings: Finding[]): string {
  return [
    `You are helping fix an AI agent context file (${file}). A deterministic`,
    `linter has already found these specific problems — do not look for others,`,
    `and only address what is listed:`,
    "",
    formatFindings(findings),
    "",
    `Here is the current file:`,
    "",
    "```markdown",
    source,
    "```",
    "",
    `Propose the minimal edits that resolve ONLY the listed findings. Output a`,
    `single unified diff (git format, with --- and +++ headers using the path`,
    `${file}). Do not rewrite unrelated content. If a finding cannot be safely`,
    `fixed by editing this file, leave it unchanged. Output only the diff inside`,
    `a \`\`\`diff code fence, nothing else.`,
  ].join("\n");
}

/** Extract the first ```diff fenced block from the model's response. */
function extractDiff(text: string): string | null {
  const m = text.match(/```diff\n([\s\S]*?)```/);
  if (m) return m[1]?.trimEnd() ?? null;
  // Fallback: a bare unified diff without a fence.
  if (/^(---|diff )/m.test(text)) return text.trim();
  return null;
}

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/**
 * Produce a suggested-fix diff for each linted file that has findings.
 * Files with no findings are skipped. Never writes to disk.
 */
export async function explainResults(
  results: LintResult[],
  options: ExplainOptions = {},
): Promise<ExplainResult[]> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No API key. Set ANTHROPIC_API_KEY to use --explain (bring your own key).",
    );
  }
  const model = options.model ?? MODEL;

  const out: ExplainResult[] = [];
  for (const result of results) {
    if (result.findings.length === 0) continue;
    let source: string;
    try {
      source = await readFile(result.file, "utf8");
    } catch {
      out.push({ file: result.file, diff: null, error: "could not read file" });
      continue;
    }
    try {
      const prompt = buildPrompt(result.file, source, result.findings);
      const text = await callAnthropic(prompt, apiKey, model);
      out.push({ file: result.file, diff: extractDiff(text) });
    } catch (err) {
      out.push({
        file: result.file,
        diff: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
