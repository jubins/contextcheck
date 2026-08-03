import * as vscode from "vscode";
import { dirname } from "node:path";
import {
  lintSource,
  findRepoRoot,
  CONTEXT_FILENAMES,
  type Finding,
} from "ctxcheck";
import { buildFix, fixTitle } from "./fixes.js";
import {
  FindingsTreeProvider,
  type FindingRef,
  type TreeItemWithRef,
} from "./tree.js";

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

/** Convert a Finding's 1-based line/column into a range over the word there. */
function findingRange(doc: vscode.TextDocument, f: Finding): vscode.Range {
  const line = Math.max(0, Math.min(f.line - 1, doc.lineCount - 1));
  const col = Math.max(0, f.column - 1);
  const start = new vscode.Position(line, col);
  const wordRange = doc.getWordRangeAtPosition(start);
  if (wordRange) return wordRange;
  const lineText = doc.lineAt(line);
  return new vscode.Range(start, lineText.range.end);
}

interface DiagnosticWithFinding extends vscode.Diagnostic {
  finding?: Finding;
}

async function lintDocument(
  doc: vscode.TextDocument,
): Promise<{ diagnostics: vscode.Diagnostic[]; findings: Finding[] }> {
  const config = vscode.workspace.getConfiguration("contextcheck");
  if (config.get<boolean>("enable") === false || !isContextFile(doc)) {
    return { diagnostics: [], findings: [] };
  }

  const filePath = doc.uri.fsPath;
  const repoRoot = await findRepoRoot(dirname(filePath));
  const result = await lintSource(doc.getText(), repoRoot, filePath);

  const diagnostics = result.findings.map((f) => {
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
  return { diagnostics, findings: result.findings };
}

/** Editor lightbulb quick fixes, delegating to the shared buildFix(). */
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
      const title = fixTitle(diag.finding);
      const edit = buildFix(doc, diag.finding);
      if (!title || !edit) continue;
      const fix = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      fix.diagnostics = [diag];
      fix.edit = edit;
      actions.push(fix);
    }
    return actions;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics =
    vscode.languages.createDiagnosticCollection("contextcheck");
  const tree = new FindingsTreeProvider();
  const view = vscode.window.createTreeView("contextcheck.findings", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  context.subscriptions.push(diagnostics, view);

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.command = "contextcheck.checkWorkspace";
  context.subscriptions.push(statusBar);

  function updateStatusBarAndBadge(): void {
    const total = tree.totalCount();
    view.badge =
      total > 0
        ? { value: total, tooltip: `${total} Context Check issues` }
        : undefined;

    const active = vscode.window.activeTextEditor?.document;
    if (active && isContextFile(active)) {
      const here = diagnostics.get(active.uri)?.length ?? 0;
      statusBar.text =
        here === 0
          ? "$(check) Context Check"
          : `$(warning) Context Check: ${here}`;
      statusBar.tooltip = "Context Check — click to re-check the workspace";
      statusBar.show();
    } else {
      statusBar.hide();
    }
  }

  async function refresh(doc: vscode.TextDocument): Promise<void> {
    if (!isContextFile(doc)) return;
    const { diagnostics: diags, findings } = await lintDocument(doc);
    diagnostics.set(doc.uri, diags);
    tree.set(doc.uri, findings);
    updateStatusBarAndBadge();
  }

  async function checkWorkspace(): Promise<void> {
    diagnostics.clear();
    tree.clear();
    const uris = await vscode.workspace.findFiles(
      `**/{${CONTEXT_FILENAMES.join(",")}}`,
      "**/node_modules/**",
    );
    for (const uri of uris) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const { diagnostics: diags, findings } = await lintDocument(doc);
        diagnostics.set(uri, diags);
        tree.set(uri, findings);
      } catch {
        // Skip files that can't be opened rather than aborting the scan.
      }
    }
    updateStatusBarAndBadge();
    vscode.window.setStatusBarMessage(
      `Context Check: scanned ${uris.length} context file(s)`,
      3000,
    );
  }

  async function goToFinding(ref: FindingRef): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(ref.uri);
    const editor = await vscode.window.showTextDocument(doc);
    const line = Math.max(0, Math.min(ref.finding.line - 1, doc.lineCount - 1));
    const pos = new vscode.Position(line, Math.max(0, ref.finding.column - 1));
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenter,
    );
  }

  /** Apply a finding's fix from the sidebar (accepts a tree item or a ref). */
  async function applyFix(arg: TreeItemWithRef | FindingRef): Promise<void> {
    const ref: FindingRef | undefined =
      "finding" in arg ? (arg as FindingRef) : (arg as TreeItemWithRef).ref;
    if (!ref) return;
    const doc = await vscode.workspace.openTextDocument(ref.uri);
    const edit = buildFix(doc, ref.finding);
    if (!edit) {
      vscode.window.showInformationMessage(
        "This finding has no automatic fix.",
      );
      return;
    }
    const ok = await vscode.workspace.applyEdit(edit);
    if (ok) {
      await doc.save();
      await refresh(doc);
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "contextcheck.checkWorkspace",
      checkWorkspace,
    ),
    vscode.commands.registerCommand("contextcheck.refresh", checkWorkspace),
    vscode.commands.registerCommand("contextcheck.goToFinding", goToFinding),
    vscode.commands.registerCommand("contextcheck.applyFix", applyFix),
    vscode.workspace.onDidSaveTextDocument((doc) => void refresh(doc)),
    vscode.workspace.onDidOpenTextDocument((doc) => void refresh(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnostics.delete(doc.uri);
      updateStatusBarAndBadge();
    }),
    vscode.window.onDidChangeActiveTextEditor(() =>
      updateStatusBarAndBadge(),
    ),
    vscode.languages.registerCodeActionsProvider(
      { language: "markdown" },
      new ContextCheckActions(),
      { providedCodeActionKinds: ContextCheckActions.kinds },
    ),
  );

  // Populate the view once on activation, then lint anything already open.
  void checkWorkspace();
  for (const doc of vscode.workspace.textDocuments) void refresh(doc);
}

export function deactivate(): void {
  // Disposables registered above are cleaned up by VS Code.
}
