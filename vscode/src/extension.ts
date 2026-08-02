import * as vscode from "vscode";
import { dirname } from "node:path";
import {
  lintSource,
  findRepoRoot,
  CONTEXT_FILENAMES,
  type Finding,
} from "ctxcheck";

const DIAGNOSTIC_SOURCE = "Context Check";

/** Is this document one of the agent context files we lint? */
function isContextFile(doc: vscode.TextDocument): boolean {
  const name = doc.uri.path.split("/").pop() ?? "";
  return CONTEXT_FILENAMES.includes(name);
}

function severityToVscode(sev: Finding["severity"]): vscode.DiagnosticSeverity {
  switch (sev) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warn":
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

/**
 * Convert a Finding's 1-based line/column into a VS Code range covering the
 * word at that position, so the squiggle lands on the offending token.
 */
function findingRange(doc: vscode.TextDocument, f: Finding): vscode.Range {
  const line = Math.max(0, f.line - 1);
  const col = Math.max(0, f.column - 1);
  const start = new vscode.Position(line, col);
  const wordRange = doc.getWordRangeAtPosition(start);
  if (wordRange) return wordRange;
  const lineText = doc.lineAt(Math.min(line, doc.lineCount - 1));
  return new vscode.Range(start, lineText.range.end);
}

/** A Finding carried on a Diagnostic so code actions can read it back. */
interface DiagnosticWithFinding extends vscode.Diagnostic {
  finding?: Finding;
}

async function lintDocument(
  doc: vscode.TextDocument,
): Promise<vscode.Diagnostic[]> {
  const config = vscode.workspace.getConfiguration("contextcheck");
  if (config.get<boolean>("enable") === false) return [];
  if (!isContextFile(doc)) return [];

  const filePath = doc.uri.fsPath;
  const repoRoot = await findRepoRoot(dirname(filePath));
  const result = await lintSource(doc.getText(), repoRoot, filePath);

  return result.findings.map((f) => {
    const diag: DiagnosticWithFinding = new vscode.Diagnostic(
      findingRange(doc, f),
      f.suggestion ? `${f.message} — ${f.suggestion}` : f.message,
      severityToVscode(f.severity),
    );
    diag.source = DIAGNOSTIC_SOURCE;
    diag.code = f.rule;
    diag.finding = f;
    return diag;
  });
}

/** Pull the backtick-wrapped suggestion token, e.g. "did you mean `build`?". */
function extractSuggestedToken(suggestion: string | undefined): string | undefined {
  if (!suggestion) return undefined;
  const m = suggestion.match(/`([^`]+)`/);
  return m ? m[1] : undefined;
}

class ContextCheckActions implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    doc: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diag of context.diagnostics as DiagnosticWithFinding[]) {
      if (diag.source !== DIAGNOSTIC_SOURCE || !diag.finding) continue;
      const f = diag.finding;

      if (f.rule === "stale-command" && f.fixable) {
        const suggested = extractSuggestedToken(f.suggestion);
        if (suggested) {
          const line = doc.lineAt(diag.range.start.line).text;
          // Replace the stale task name in the command with the suggestion.
          const fix = new vscode.CodeAction(
            `Replace with \`${suggested}\``,
            vscode.CodeActionKind.QuickFix,
          );
          fix.diagnostics = [diag];
          fix.edit = new vscode.WorkspaceEdit();
          const replaced = replaceLastTaskToken(line, suggested);
          if (replaced !== undefined) {
            fix.edit.replace(
              doc.uri,
              doc.lineAt(diag.range.start.line).range,
              replaced,
            );
            actions.push(fix);
          }
        }
      }

      if (f.rule === "dead-path") {
        // Offer to remove the line referencing a path that doesn't exist.
        const fix = new vscode.CodeAction(
          "Remove line referencing missing path",
          vscode.CodeActionKind.QuickFix,
        );
        fix.diagnostics = [diag];
        fix.edit = new vscode.WorkspaceEdit();
        const lineIdx = diag.range.start.line;
        fix.edit.delete(
          doc.uri,
          new vscode.Range(
            new vscode.Position(lineIdx, 0),
            new vscode.Position(
              Math.min(lineIdx + 1, doc.lineCount - 1),
              lineIdx + 1 < doc.lineCount ? 0 : doc.lineAt(lineIdx).range.end.character,
            ),
          ),
        );
        actions.push(fix);
      }
    }
    return actions;
  }
}

/**
 * Replace the last run-token on a command line with `suggested`. Handles
 * `npm run OLD` -> `npm run NEW` and `make OLD` -> `make NEW` by swapping the
 * final whitespace-delimited token that precedes any trailing comment.
 */
function replaceLastTaskToken(line: string, suggested: string): string | undefined {
  // Split off a trailing inline comment so we don't clobber it.
  const commentIdx = line.search(/\s#/);
  const head = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const tail = commentIdx >= 0 ? line.slice(commentIdx) : "";
  const m = head.match(/^(.*\S\s+)(\S+)(\s*)$/);
  if (!m) return undefined;
  return `${m[1]}${suggested}${m[3]}${tail}`;
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("contextcheck");
  context.subscriptions.push(diagnostics);

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.command = "contextcheck.checkWorkspace";
  context.subscriptions.push(statusBar);

  async function refresh(doc: vscode.TextDocument): Promise<void> {
    if (!isContextFile(doc)) return;
    const diags = await lintDocument(doc);
    diagnostics.set(doc.uri, diags);
    updateStatusBar();
  }

  function updateStatusBar(): void {
    let count = 0;
    diagnostics.forEach((_uri, diags) => {
      count += diags.length;
    });
    const active = vscode.window.activeTextEditor?.document;
    if (active && isContextFile(active)) {
      statusBar.text =
        count === 0
          ? "$(check) Context Check"
          : `$(warning) Context Check: ${count}`;
      statusBar.tooltip = "Context Check findings — click to re-check workspace";
      statusBar.show();
    } else {
      statusBar.hide();
    }
  }

  async function checkWorkspace(): Promise<void> {
    diagnostics.clear();
    const uris = await vscode.workspace.findFiles(
      `**/{${CONTEXT_FILENAMES.join(",")}}`,
      "**/node_modules/**",
    );
    for (const uri of uris) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        diagnostics.set(uri, await lintDocument(doc));
      } catch {
        // A file that can't be opened is skipped rather than crashing.
      }
    }
    updateStatusBar();
    vscode.window.setStatusBarMessage(
      `Context Check: scanned ${uris.length} context file(s)`,
      3000,
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "contextcheck.checkWorkspace",
      checkWorkspace,
    ),
    vscode.workspace.onDidSaveTextDocument((doc) => void refresh(doc)),
    vscode.workspace.onDidOpenTextDocument((doc) => void refresh(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnostics.delete(doc.uri);
      updateStatusBar();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar()),
    vscode.languages.registerCodeActionsProvider(
      { language: "markdown" },
      new ContextCheckActions(),
      { providedCodeActionKinds: ContextCheckActions.kinds },
    ),
  );

  // Lint anything already open on activation.
  for (const doc of vscode.workspace.textDocuments) {
    void refresh(doc);
  }
}

export function deactivate(): void {
  // Nothing to clean up beyond the disposables registered above.
}
