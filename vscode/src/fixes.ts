import * as vscode from "vscode";
import type { Finding } from "contextcheck-cli";

/** Pull the backtick-wrapped suggestion token, e.g. "did you mean `build`?". */
export function extractSuggestedToken(
  suggestion: string | undefined,
): string | undefined {
  if (!suggestion) return undefined;
  const m = suggestion.match(/`([^`]+)`/);
  return m ? m[1] : undefined;
}

/**
 * Swap the package-manager word at the head of a command line. Preserves the
 * surrounding markdown (list bullets, backticks, fences) by rewriting only the
 * `npm` token itself, and drops the `run` that pnpm/yarn/bun don't need for
 * non-script subcommands they define natively.
 */
export function replacePackageManager(
  line: string,
  pm: string,
): string | undefined {
  // Match `npm` as a standalone word, not inside a longer identifier.
  const m = line.match(/(^|[^\w-])npm(?=$|[^\w-])/);
  const prefix = m?.[1];
  if (m?.index === undefined || prefix === undefined) return undefined;
  const at = m.index + prefix.length;
  return `${line.slice(0, at)}${pm}${line.slice(at + 3)}`;
}

/**
 * Swap a tool name for the one the repo actually uses, e.g. `jest` -> `vitest`.
 * Rewrites every standalone occurrence on the line so a sentence naming the
 * tool twice doesn't end up half-corrected.
 */
export function replaceToolName(
  line: string,
  named: string,
  actual: string,
): string | undefined {
  if (named.length === 0) return undefined;
  // Scan for standalone occurrences rather than building a RegExp from the
  // tool name: a word character or hyphen on either side means it is part of a
  // longer identifier (e.g. `jest-worker`) and must be left alone.
  const isWordChar = (ch: string | undefined): boolean =>
    ch !== undefined && /[\w-]/.test(ch);
  const haystack = line.toLowerCase();
  const needle = named.toLowerCase();
  let out = "";
  let cursor = 0;
  let found = false;
  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at < 0) break;
    const end = at + needle.length;
    if (!isWordChar(line[at - 1]) && !isWordChar(line[end])) {
      out += line.slice(cursor, at) + actual;
      cursor = end;
      found = true;
    } else {
      out += line.slice(cursor, end);
      cursor = end;
    }
  }
  if (!found) return undefined;
  return out + line.slice(cursor);
}

/**
 * Replace the last run-token on a command line with `suggested`. Handles
 * `npm run OLD` -> `npm run NEW` and `make OLD` -> `make NEW` by swapping the
 * final whitespace-delimited token that precedes any trailing comment.
 */
export function replaceLastTaskToken(
  line: string,
  suggested: string,
): string | undefined {
  const commentIdx = line.search(/\s#/);
  const head = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const tail = commentIdx >= 0 ? line.slice(commentIdx) : "";
  const m = head.match(/^(.*\S\s+)(\S+)(\s*)$/);
  if (!m) return undefined;
  return `${m[1]}${suggested}${m[3]}${tail}`;
}

/** First backtick-wrapped token in a string, e.g. the path in a message. */
function firstBacktickToken(text: string): string | undefined {
  const m = text.match(/`([^`]+)`/);
  return m ? m[1] : undefined;
}

/** All backtick-wrapped tokens in a string, in order. */
function backtickTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const token = m[1];
    if (token !== undefined) out.push(token);
  }
  return out;
}

/**
 * The package manager a `wrong-package-manager` finding points at. The message
 * reads "...lockfile indicates pnpm" and the suggestion "use `pnpm` to match".
 */
function packageManagerOf(finding: Finding): string | undefined {
  const fromSuggestion = extractSuggestedToken(finding.suggestion);
  if (fromSuggestion) return fromSuggestion;
  const m = finding.message.match(/lockfile indicates (\w+)/);
  return m ? m[1] : undefined;
}

/**
 * The (named, actual) pair for a `tool-mismatch` finding, whose message reads
 * "claims `jest` but the repo uses `vitest`".
 */
function toolPairOf(
  finding: Finding,
): { named: string; actual: string } | undefined {
  const [named, actual] = backtickTokens(finding.message);
  if (named === undefined || actual === undefined) return undefined;
  return { named, actual };
}

/** A human label for the fix a finding supports, or undefined if none. */
export function fixTitle(finding: Finding): string | undefined {
  if (finding.rule === "stale-command" && finding.fixable) {
    const s = extractSuggestedToken(finding.suggestion);
    return s ? `Replace with \`${s}\`` : undefined;
  }
  if (finding.rule === "case-mismatch-path" && finding.fixable) {
    const corrected = extractSuggestedToken(finding.suggestion);
    return corrected ? `Fix casing to \`${corrected}\`` : undefined;
  }
  if (finding.rule === "dead-path") {
    return "Remove line referencing missing path";
  }
  if (finding.rule === "wrong-package-manager") {
    const pm = packageManagerOf(finding);
    return pm ? `Switch to \`${pm}\`` : undefined;
  }
  if (finding.rule === "tool-mismatch") {
    const pair = toolPairOf(finding);
    return pair ? `Replace \`${pair.named}\` with \`${pair.actual}\`` : undefined;
  }
  return undefined;
}

/**
 * Build the WorkspaceEdit that fixes a finding in `doc`, or undefined when the
 * finding isn't fixable. Shared by the editor quick-fix provider and the
 * sidebar tree so both apply identical edits.
 */
export function buildFix(
  doc: vscode.TextDocument,
  finding: Finding,
): vscode.WorkspaceEdit | undefined {
  const lineIdx = Math.max(0, finding.line - 1);
  if (lineIdx >= doc.lineCount) return undefined;
  const edit = new vscode.WorkspaceEdit();

  if (finding.rule === "stale-command" && finding.fixable) {
    const suggested = extractSuggestedToken(finding.suggestion);
    if (!suggested) return undefined;
    const lineText = doc.lineAt(lineIdx).text;
    const replaced = replaceLastTaskToken(lineText, suggested);
    if (replaced === undefined) return undefined;
    edit.replace(doc.uri, doc.lineAt(lineIdx).range, replaced);
    return edit;
  }

  if (finding.rule === "case-mismatch-path" && finding.fixable) {
    // The message holds the original (wrong-cased) path; the suggestion holds
    // the corrected path. Swap the first occurrence of the original on the line.
    const original = firstBacktickToken(finding.message);
    const corrected = extractSuggestedToken(finding.suggestion);
    if (!original || !corrected) return undefined;
    const lineText = doc.lineAt(lineIdx).text;
    const at = lineText.indexOf(original);
    if (at < 0) return undefined;
    const range = new vscode.Range(
      new vscode.Position(lineIdx, at),
      new vscode.Position(lineIdx, at + original.length),
    );
    edit.replace(doc.uri, range, corrected);
    return edit;
  }

  if (finding.rule === "dead-path") {
    // Delete the whole line, including its trailing newline when present.
    const start = new vscode.Position(lineIdx, 0);
    const end =
      lineIdx + 1 < doc.lineCount
        ? new vscode.Position(lineIdx + 1, 0)
        : doc.lineAt(lineIdx).range.end;
    edit.delete(doc.uri, new vscode.Range(start, end));
    return edit;
  }

  if (finding.rule === "wrong-package-manager") {
    const pm = packageManagerOf(finding);
    if (!pm) return undefined;
    const lineText = doc.lineAt(lineIdx).text;
    const replaced = replacePackageManager(lineText, pm);
    if (replaced === undefined) return undefined;
    edit.replace(doc.uri, doc.lineAt(lineIdx).range, replaced);
    return edit;
  }

  if (finding.rule === "tool-mismatch") {
    const pair = toolPairOf(finding);
    if (!pair) return undefined;
    const lineText = doc.lineAt(lineIdx).text;
    const replaced = replaceToolName(lineText, pair.named, pair.actual);
    if (replaced === undefined) return undefined;
    edit.replace(doc.uri, doc.lineAt(lineIdx).range, replaced);
    return edit;
  }

  return undefined;
}
