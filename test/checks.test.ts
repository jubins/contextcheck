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
});
