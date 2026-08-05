import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lintSource } from "../src/index.js";
import { levenshtein, closestMatch, commandTarget } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

async function lint(md: string, repo = "npm-repo") {
  const res = await lintSource(md, fx(repo), "AGENTS.md");
  return res.findings;
}

describe("levenshtein / closestMatch", () => {
  it("computes edit distance", () => {
    expect(levenshtein("build", "biuld")).toBe(2);
    expect(levenshtein("test", "test")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("finds a close match within threshold", () => {
    expect(closestMatch("biuld", ["build", "test"], 3)).toBe("build");
  });

  it("returns undefined when nothing is close enough", () => {
    expect(closestMatch("deploy", ["build", "test"], 3)).toBeUndefined();
  });
});

describe("commandTarget", () => {
  it("parses npm run", () => {
    expect(commandTarget("npm run build")).toEqual({
      task: "build",
      runner: "npm",
    });
  });
  it("parses make target", () => {
    expect(commandTarget("make lint")).toEqual({ task: "lint", runner: "make" });
  });
  it("ignores npm install (builtin)", () => {
    expect(commandTarget("npm install")).toBeUndefined();
  });
  it("ignores cargo build (not script-based)", () => {
    expect(commandTarget("cargo build")).toBeUndefined();
  });
});

describe("stale-command", () => {
  it("positive: flags a missing script with a suggestion", async () => {
    const f = await lint("```bash\nnpm run biuld\n```");
    const stale = f.find((x) => x.rule === "stale-command");
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe("error");
    expect(stale!.suggestion).toContain("build");
    expect(stale!.fixable).toBe(true);
  });

  it("negative: does not flag an existing script", async () => {
    const f = await lint("```bash\nnpm run build\n```");
    expect(f.some((x) => x.rule === "stale-command")).toBe(false);
  });

  it("does not flag package-manager builtins", async () => {
    const f = await lint("```bash\nnpm install && npm ci\n```");
    expect(f.some((x) => x.rule === "stale-command")).toBe(false);
  });

  it("no suggestion when nothing is within 3 edits", async () => {
    const f = await lint("```bash\nnpm run deployment\n```");
    const stale = f.find((x) => x.rule === "stale-command");
    expect(stale).toBeDefined();
    expect(stale!.suggestion).toBeUndefined();
    expect(stale!.fixable).toBe(false);
  });
});

describe("dead-path", () => {
  it("positive: flags a missing path as error at high confidence", async () => {
    const f = await lint("See `src/nope.ts` here.");
    const dead = f.find((x) => x.rule === "dead-path");
    expect(dead).toBeDefined();
    expect(dead!.severity).toBe("error");
  });

  it("negative: does not flag an existing path", async () => {
    const f = await lint("See `src/services/auth.ts` here.");
    expect(f.some((x) => x.rule === "dead-path")).toBe(false);
  });

  it("low-confidence prose path is a warning, not an error", async () => {
    const f = await lint("Handlers live in src/gone/index.ts today.");
    const dead = f.find((x) => x.rule === "dead-path");
    expect(dead).toBeDefined();
    expect(dead!.severity).toBe("warn");
  });
});

describe("case-mismatch-path", () => {
  it("positive: flags a case-only mismatch as error", async () => {
    const res = await lintSource(
      "See `src/Services/auth.ts`.",
      fx("paths-repo"),
      "AGENTS.md",
    );
    const cm = res.findings.find((x) => x.rule === "case-mismatch-path");
    expect(cm).toBeDefined();
    expect(cm!.severity).toBe("error");
    expect(cm!.suggestion).toContain("services");
  });

  it("is fixable and suggests the full corrected path", async () => {
    const res = await lintSource(
      "See `src/Services/auth.ts`.",
      fx("paths-repo"),
      "AGENTS.md",
    );
    const cm = res.findings.find((x) => x.rule === "case-mismatch-path");
    expect(cm!.fixable).toBe(true);
    expect(cm!.suggestion).toContain("`src/services/auth.ts`");
  });
});

describe("wrong-package-manager", () => {
  it("positive: flags npm commands in a pnpm repo", async () => {
    // pnpm-repo has pnpm-lock.yaml and a `build` script.
    const f = await lint("```bash\nnpm run build\n```", "pnpm-repo");
    const wpm = f.find((x) => x.rule === "wrong-package-manager");
    expect(wpm).toBeDefined();
    expect(wpm!.severity).toBe("info");
    expect(wpm!.message).toContain("pnpm");
  });

  it("negative: does not flag npm commands in an npm repo", async () => {
    const f = await lint("```bash\nnpm run build\n```", "npm-repo");
    expect(f.some((x) => x.rule === "wrong-package-manager")).toBe(false);
  });

  it("negative: does not flag non-npm commands in a pnpm repo", async () => {
    const f = await lint("```bash\npnpm run build\n```", "pnpm-repo");
    expect(f.some((x) => x.rule === "wrong-package-manager")).toBe(false);
  });
});

describe("undocumented-task", () => {
  it("positive: flags an important task the file never mentions", async () => {
    // npm-repo defines test/build/lint; document only build.
    const f = await lint("```bash\nnpm run build\n```", "npm-repo");
    const undoc = f.filter((x) => x.rule === "undocumented-task");
    const names = undoc.map((x) => x.message);
    expect(undoc.length).toBeGreaterThan(0);
    expect(undoc[0]!.severity).toBe("info");
    // `test` and `lint` are undocumented; `build` is documented.
    expect(names.some((m) => m.includes("`test`"))).toBe(true);
    expect(names.some((m) => m.includes("`lint`"))).toBe(true);
    expect(names.some((m) => m.includes("`build`"))).toBe(false);
  });

  it("negative: no finding when all important tasks are documented", async () => {
    const f = await lint(
      "```bash\nnpm run build\nnpm test\nnpm run lint\n```",
      "npm-repo",
    );
    expect(f.some((x) => x.rule === "undocumented-task")).toBe(false);
  });

  it("does not flag tasks the repo doesn't define", async () => {
    // npm-repo has no `typecheck` or `dev` script, so those aren't flagged.
    const f = await lint("```bash\nnpm run build\nnpm test\nnpm run lint\n```", "npm-repo");
    const msgs = f.filter((x) => x.rule === "undocumented-task").map((x) => x.message);
    expect(msgs.some((m) => m.includes("typecheck"))).toBe(false);
    expect(msgs.some((m) => m.includes("`dev`"))).toBe(false);
  });
});

describe("rule config", () => {
  it("disabling stale-command silences it", async () => {
    const res = await lintSource(
      "```bash\nnpm run biuld\n```",
      fx("npm-repo"),
      "AGENTS.md",
      { rules: { "stale-command": false } },
    );
    expect(res.findings.some((x) => x.rule === "stale-command")).toBe(false);
  });

  it("disabling undocumented-task silences it", async () => {
    const res = await lintSource(
      "```bash\nnpm run build\n```",
      fx("npm-repo"),
      "AGENTS.md",
      { rules: { "undocumented-task": false } },
    );
    expect(res.findings.some((x) => x.rule === "undocumented-task")).toBe(false);
  });
});

describe("tool-mismatch", () => {
  it("positive: flags a claimed tool the repo replaced with a competitor", async () => {
    // npm-repo devDeps include vitest; the file claims jest.
    const f = await lint("We use `jest` for testing.");
    const tm = f.find((x) => x.rule === "tool-mismatch");
    expect(tm).toBeDefined();
    expect(tm!.severity).toBe("warn");
    expect(tm!.message).toContain("jest");
    expect(tm!.message).toContain("vitest");
  });

  it("negative: does not flag a tool that is actually present", async () => {
    const f = await lint("We use `vitest` for testing.");
    expect(f.some((x) => x.rule === "tool-mismatch")).toBe(false);
  });

  it("negative: does not flag when no competitor is present", async () => {
    // prettier has no competing tool in npm-repo's deps.
    const f = await lint("Format with `prettier`.");
    expect(f.some((x) => x.rule === "tool-mismatch")).toBe(false);
  });
});

describe("oversized", () => {
  const bigFile = (() => {
    const lines = ["# Title", "## Architecture"];
    for (let i = 0; i < 90; i++) lines.push(`arch ${i}`);
    lines.push("## Setup");
    for (let i = 0; i < 70; i++) lines.push(`setup ${i}`);
    return lines.join("\n");
  })();

  it("positive: flags an over-threshold file with largest sections", async () => {
    const res = await lintSource(bigFile, fx("npm-repo"), "AGENTS.md");
    const o = res.findings.find((x) => x.rule === "oversized");
    expect(o).toBeDefined();
    expect(o!.severity).toBe("warn");
    expect(o!.message).toContain("threshold 150");
    expect(o!.message).toContain("Architecture");
  });

  it("negative: does not flag a short file", async () => {
    const res = await lintSource("# Small\n\nJust a few lines.", fx("npm-repo"), "AGENTS.md");
    expect(res.findings.some((x) => x.rule === "oversized")).toBe(false);
  });
});
