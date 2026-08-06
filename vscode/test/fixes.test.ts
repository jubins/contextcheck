import { describe, it, expect, vi } from "vitest";
import type { Finding } from "contextcheck-cli";

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

const { buildFix, fixTitle, replacePackageManager, replaceToolName } =
  await import("../src/fixes.js");

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

/** Read the single replacement text out of a built edit. */
function replacementText(edit: unknown): string | undefined {
  const e = edit as { edits?: Array<{ op: string; text?: string }> };
  return e?.edits?.[0]?.text;
}

function pmFinding(line: number, pm = "pnpm"): Finding {
  return finding({
    rule: "wrong-package-manager",
    severity: "info",
    line,
    message: `command uses \`npm\` but this repo's lockfile indicates ${pm}`,
    suggestion: `use \`${pm}\` to match the repo`,
    fixable: false,
  });
}

describe("replacePackageManager", () => {
  it("swaps a bare npm invocation", () => {
    expect(replacePackageManager("npm run test", "pnpm")).toBe("pnpm run test");
  });

  it("preserves markdown around the command", () => {
    expect(replacePackageManager("- Run `npm run test` first.", "yarn")).toBe(
      "- Run `yarn run test` first.",
    );
  });

  it("leaves lookalike identifiers alone", () => {
    expect(replacePackageManager("see npmrc notes", "pnpm")).toBeUndefined();
    expect(replacePackageManager("check my-npm-thing", "pnpm")).toBeUndefined();
  });
});

describe("wrong-package-manager fix", () => {
  it("is offered even though the finding is not `fixable`", () => {
    // The CLI marks this rule fixable:false (no LLM rewrite needed), but the
    // editor can still do the swap deterministically.
    expect(fixTitle(pmFinding(1))).toBe("Switch to `pnpm`");
  });

  it("rewrites the command line", () => {
    const doc = mockDoc(["Install deps with `npm ci`."]);
    expect(replacementText(buildFix(doc, pmFinding(1)))).toBe(
      "Install deps with `pnpm ci`.",
    );
  });

  it("falls back to the message when the suggestion is absent", () => {
    const f = pmFinding(1);
    f.suggestion = undefined;
    expect(fixTitle(f)).toBe("Switch to `pnpm`");
  });
});

describe("replaceToolName", () => {
  it("swaps every standalone occurrence", () => {
    expect(replaceToolName("We use jest; jest runs fast.", "jest", "vitest")).toBe(
      "We use vitest; vitest runs fast.",
    );
  });

  it("does not corrupt longer identifiers", () => {
    // No standalone occurrence, so there is no fix to offer.
    expect(
      replaceToolName("jest-environment stays", "jest", "vitest"),
    ).toBeUndefined();
  });
});

describe("tool-mismatch fix", () => {
  const f = finding({
    rule: "tool-mismatch",
    severity: "warn",
    line: 1,
    message: "claims `jest` but the repo uses `vitest`",
    suggestion: "update the docs to reference `vitest`",
    fixable: false,
  });

  it("labels the swap", () => {
    expect(fixTitle(f)).toBe("Replace `jest` with `vitest`");
  });

  it("rewrites the line", () => {
    const doc = mockDoc(["Tests run under jest."]);
    expect(replacementText(buildFix(doc, f))).toBe("Tests run under vitest.");
  });

  it("returns undefined when the tool isn't on the line", () => {
    const doc = mockDoc(["nothing relevant here"]);
    expect(buildFix(doc, f)).toBeUndefined();
  });
});
