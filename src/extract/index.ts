import { fromMarkdown } from "mdast-util-from-markdown";
import type {
  Root,
  RootContent,
  Code,
  InlineCode,
  Heading,
  Text,
  PhrasingContent,
} from "mdast";
import type { Claim } from "../types.js";
import { SHELL_FENCE_LANGS } from "./patterns.js";
import {
  stripPrompt,
  splitChain,
  isKnownRunnerCommand,
  normalizeCommand,
  firstToken,
} from "./command.js";
import { assessPath } from "./path.js";

/**
 * Extract all verifiable claims from a context file's markdown source.
 *
 * Works from the markdown AST (not regex over raw text) so line numbers and
 * fence/inline/prose context are accurate.
 */
export function extractClaims(source: string): Claim[] {
  const tree = fromMarkdown(source) as Root;
  const claims: Claim[] = [];
  walk(tree.children, claims);
  return claims;
}

function walk(nodes: RootContent[] | PhrasingContent[], out: Claim[]): void {
  for (const node of nodes) {
    switch (node.type) {
      case "code":
        extractFromCodeFence(node, out);
        break;
      case "inlineCode":
        extractFromInlineCode(node, out);
        break;
      case "heading":
        extractFromHeading(node, out);
        break;
      case "text":
        collectProsePaths(node, out, "prose");
        break;
      default: {
        // Recurse into any node with children (paragraphs, lists, etc.).
        const children = (node as { children?: unknown }).children;
        if (Array.isArray(children)) {
          walk(children as RootContent[], out);
        }
      }
    }
  }
}

/** A fenced block. Shell-ish fences yield command claims, line by line. */
function extractFromCodeFence(node: Code, out: Claim[]): void {
  const lang = (node.lang ?? "").toLowerCase();
  const fenceStartLine = node.position?.start.line ?? 1;
  const lines = node.value.split("\n");

  const looksShell =
    SHELL_FENCE_LANGS.has(lang) ||
    (lang === "" && fenceLooksShellLike(lines));
  if (!looksShell) return;

  lines.forEach((rawLine, idx) => {
    // Body line N (0-based) sits on source line fenceStart + 1 + N.
    const sourceLine = fenceStartLine + 1 + idx;
    const { text: promptless, offset: promptOffset } = stripPrompt(rawLine);
    if (promptless.length === 0) return;
    if (promptless.startsWith("#")) return; // comment line

    for (const part of splitChain(promptless)) {
      if (!isKnownRunnerCommand(part.text)) continue;
      const command = stripInlineComment(part.text);
      if (command.length === 0) continue;
      out.push({
        kind: "command",
        raw: command,
        value: normalizeCommand(command),
        line: sourceLine,
        // +1 to convert 0-based offset to 1-based column.
        column: promptOffset + part.offset + 1,
        context: "code-fence",
        confidence: "high",
      });
    }
  });
}

/** Inline code: a command if it starts with a known runner, else maybe a path. */
function extractFromInlineCode(node: InlineCode, out: Claim[]): void {
  const line = node.position?.start.line ?? 1;
  const column = node.position?.start.column ?? 1;
  const value = node.value.trim();
  if (value.length === 0) return;

  if (isKnownRunnerCommand(value)) {
    // Inline code may still be a chain; split it so each command is a claim.
    for (const part of splitChain(value)) {
      if (!isKnownRunnerCommand(part.text)) continue;
      out.push({
        kind: "command",
        raw: part.text,
        value: normalizeCommand(part.text),
        line,
        column,
        context: "inline-code",
        confidence: "high",
      });
    }
    return;
  }

  // Single-token inline code may be a path reference.
  if (!/\s/.test(value)) {
    const assessment = assessPath(value);
    if (assessment.isPath) {
      out.push({
        kind: "path",
        raw: value,
        value: assessment.value,
        line,
        column,
        context: "inline-code",
        confidence: assessment.confidence,
      });
    }
  }
}

/** Headings can name a path (e.g. `## src/api/`); treat as low confidence. */
function extractFromHeading(node: Heading, out: Claim[]): void {
  for (const child of node.children) {
    if (child.type !== "text") continue;
    collectProsePaths(child, out, "heading");
  }
}

/**
 * A fence with no language is shell-like only if a majority of its non-empty,
 * non-comment lines begin with a known runner. Conservative on purpose.
 */
function fenceLooksShellLike(lines: string[]): boolean {
  let considered = 0;
  let shellish = 0;
  for (const raw of lines) {
    const { text } = stripPrompt(raw);
    if (text.length === 0 || text.startsWith("#")) continue;
    considered++;
    const parts = splitChain(text);
    if (parts.some((p) => isKnownRunnerCommand(p.text))) shellish++;
  }
  return considered > 0 && shellish / considered >= 0.5;
}

/** Strip a trailing ` # comment` from a command line (outside quotes). */
function stripInlineComment(command: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#" && (i === 0 || command[i - 1] === " ")) {
      return command.slice(0, i).trimEnd();
    }
  }
  return command.trimEnd();
}

/**
 * Prose/heading path detection. Splits text into whitespace tokens and keeps
 * any that assess as paths, always at low confidence (heuristic guess).
 */
function collectProsePaths(
  node: Text,
  out: Claim[],
  context: "prose" | "heading",
): void {
  const line = node.position?.start.line ?? 1;
  const startCol = node.position?.start.column ?? 1;
  const text = node.value;
  const tokenRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    const assessment = assessPath(m[0]);
    if (!assessment.isPath) continue;
    out.push({
      kind: "path",
      raw: m[0],
      value: assessment.value,
      line,
      column: startCol + m.index,
      context,
      confidence: "low",
    });
  }
}

// Re-exported so tests and downstream code can reach the primitives.
export { firstToken };
