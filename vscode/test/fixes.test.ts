import { describe, it, expect, vi } from "vitest";
import type { Finding } from "ctxcheck";

// The `vscode` module isn't available under vitest, so stub the tiny surface
// that fixes.ts touches (Position, Range, WorkspaceEdit).
vi.mock("vscode", () => {
  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
  }
  class Range {
    constructor(
      public start: Position,
      public end: Position,
    ) {}
  }
  class WorkspaceEdit {
    edits: Array<{ op: string; text?: string; range?: Range }> = [];
    replace(_u: unknown, range: Range, text: string) {
      this.edits.push({ op: "replace", range, text });
    }
    delete(_u: unknown, range: Range) {
      this.edits.push({ op: "delete", range });
    }
  }
  return { Position, Range, WorkspaceEdit };
});

const { buildFix, fixTitle } = await import("../src/fixes.js");

/** Minimal TextDocument mock over a single string of lines. */
function mockDoc(lines: string[]) {
  return {
    uri: { toString: () => "mock" },
    lineCount: lines.length,
    lineAt(i: number) {
      const text = lines[i]!;
      return {
        text,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: text.length },
        },
      };
    },
  } as unknown as import("vscode").TextDocument;
}

function finding(partial: Partial<Finding>): Finding {
  return {
    rule: "case-mismatch-path",
    severity: "error",
    message: "",
    line: 1,
    column: 1,
    fixable: true,
    ...partial,
  };
}

describe("fixTitle", () => {
  it("labels a case-mismatch fix", () => {
    const f = finding({
      rule: "case-mismatch-path",
      message: "path `src/Services/types.ts` exists with different casing",
      suggestion: "did you mean `src/services/types.ts`?",
      fixable: true,
    });
    expect(fixTitle(f)).toBe("Fix casing to `src/services/types.ts`");
  });

  it("returns undefined for a non-fixable case-mismatch", () => {
    const f = finding({ rule: "case-mismatch-path", fixable: false });
    expect(fixTitle(f)).toBeUndefined();
  });
});

describe("buildFix — case-mismatch-path", () => {
  it("replaces the wrong-cased path with the corrected one", () => {
    const doc = mockDoc(["Shared types are in `src/Services/types.ts`."]);
    const f = finding({
      rule: "case-mismatch-path",
      line: 1,
      message: "path `src/Services/types.ts` exists with different casing",
      suggestion: "did you mean `src/services/types.ts`?",
      fixable: true,
    });
    const edit = buildFix(doc, f) as unknown as {
      edits: Array<{ op: string; text: string; range: { start: { character: number }; end: { character: number } } }>;
    };
    expect(edit).toBeDefined();
    expect(edit.edits).toHaveLength(1);
    const e = edit.edits[0]!;
    expect(e.op).toBe("replace");
    expect(e.text).toBe("src/services/types.ts");
    // Range should cover the original token (starts at the backtick+1).
    const line = "Shared types are in `src/Services/types.ts`.";
    expect(e.range.start.character).toBe(line.indexOf("src/Services/types.ts"));
  });

  it("returns undefined when the path isn't on the line", () => {
    const doc = mockDoc(["a totally different line"]);
    const f = finding({
      rule: "case-mismatch-path",
      line: 1,
      message: "path `src/Services/types.ts` exists with different casing",
      suggestion: "did you mean `src/services/types.ts`?",
      fixable: true,
    });
    expect(buildFix(doc, f)).toBeUndefined();
  });
});
