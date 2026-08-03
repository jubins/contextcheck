import * as vscode from "vscode";
import { basename } from "node:path";
import type { Finding } from "ctxcheck";
import { fixTitle } from "./fixes.js";

/** A finding paired with the file it came from. */
export interface FindingRef {
  uri: vscode.Uri;
  finding: Finding;
}

/** Tree nodes: a file group, or a single finding under it. */
export type Node =
  | { kind: "file"; uri: vscode.Uri; count: number }
  | { kind: "finding"; ref: FindingRef };

function severityIcon(sev: Finding["severity"]): vscode.ThemeIcon {
  switch (sev) {
    case "error":
      return new vscode.ThemeIcon(
        "error",
        new vscode.ThemeColor("problemsErrorIcon.foreground"),
      );
    case "warn":
      return new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("problemsWarningIcon.foreground"),
      );
    default:
      return new vscode.ThemeIcon(
        "info",
        new vscode.ThemeColor("problemsInfoIcon.foreground"),
      );
  }
}

export class FindingsTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChange = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  /** Findings keyed by file fsPath. */
  private byFile = new Map<string, FindingRef[]>();

  /** Replace all findings for a URI (empty array clears it). */
  set(uri: vscode.Uri, findings: Finding[]): void {
    if (findings.length === 0) this.byFile.delete(uri.fsPath);
    else this.byFile.set(
      uri.fsPath,
      findings.map((finding) => ({ uri, finding })),
    );
    this._onDidChange.fire(undefined);
  }

  clear(): void {
    this.byFile.clear();
    this._onDidChange.fire(undefined);
  }

  /** Total findings across all files, for the status bar / badge. */
  totalCount(): number {
    let n = 0;
    for (const refs of this.byFile.values()) n += refs.length;
    return n;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "file") {
      const item = new vscode.TreeItem(
        basename(node.uri.fsPath),
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.resourceUri = node.uri;
      item.iconPath = vscode.ThemeIcon.File;
      item.description = `${node.count} ${node.count === 1 ? "issue" : "issues"}`;
      item.contextValue = "contextcheck.file";
      return item;
    }

    const { finding, uri } = node.ref;
    const item = new vscode.TreeItem(
      finding.message.replace(/`/g, ""),
      vscode.TreeItemCollapsibleState.None,
    );
    item.iconPath = severityIcon(finding.severity);
    item.description = `line ${finding.line}`;
    item.tooltip = finding.suggestion
      ? `${finding.message}\n${finding.suggestion}`
      : finding.message;
    // Clicking a finding jumps to it in the editor.
    item.command = {
      command: "contextcheck.goToFinding",
      title: "Go to finding",
      arguments: [node.ref],
    };
    // contextValue drives which inline buttons show (see package.json menus).
    item.contextValue = fixTitle(finding)
      ? "contextcheck.finding.fixable"
      : "contextcheck.finding";
    // Stash the ref so the inline command can retrieve it.
    (item as TreeItemWithRef).ref = node.ref;
    void uri;
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      // Top level: one node per file with findings, sorted by name.
      return [...this.byFile.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, refs]) => ({
          kind: "file" as const,
          uri: refs[0]!.uri,
          count: refs.length,
        }));
    }
    if (node.kind === "file") {
      const refs = this.byFile.get(node.uri.fsPath) ?? [];
      return refs
        .slice()
        .sort((a, b) => a.finding.line - b.finding.line)
        .map((ref) => ({ kind: "finding" as const, ref }));
    }
    return [];
  }
}

/** TreeItem carrying its FindingRef so inline commands can read it back. */
export interface TreeItemWithRef extends vscode.TreeItem {
  ref?: FindingRef;
}
