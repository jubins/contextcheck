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

  return undefined;
}
