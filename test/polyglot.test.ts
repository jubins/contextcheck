import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MakefileResolver,
  PythonResolver,
  parseMakefileTargets,
  parsePyprojectScripts,
  parseToxEnvlist,
  commandTarget,
  lintSource,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

describe("parseMakefileTargets", () => {
  const mk = [
    ".PHONY: build test",
    "",
    "CC := gcc",
    "build:",
    "\ttsc",
    "deploy: build",
    "\t./deploy.sh",
    "%.o: %.c",
    "\t$(CC) -c $<",
  ].join("\n");

  it("collects real targets and .PHONY names", () => {
    const t = parseMakefileTargets(mk);
    expect(t).toContain("build");
    expect(t).toContain("test");
    expect(t).toContain("deploy");
  });

  it("excludes variable assignments and pattern rules", () => {
    const t = parseMakefileTargets(mk);
    expect(t).not.toContain("CC");
    expect(t.some((x) => x.includes("%"))).toBe(false);
  });
});

describe("MakefileResolver", () => {
  const r = new MakefileResolver();

  it("detects a Makefile repo", async () => {
    expect(await r.detect(fx("make-repo"))).toBe(true);
  });

  it("returns false without a Makefile", async () => {
    expect(await r.detect(fx("python-repo"))).toBe(false);
  });

  it("enumerates targets, tabs and pattern rules handled", async () => {
    const tasks = await r.tasks(fx("make-repo"));
    expect([...tasks.keys()].sort()).toEqual(["build", "lint", "test"]);
    expect(tasks.get("build")?.source).toBe("makefile");
  });
});

describe("parsePyprojectScripts", () => {
  it("collects project, poetry, and hatch env scripts", () => {
    const toml = [
      "[project.scripts]",
      'demo = "d:main"',
      "[tool.poetry.scripts]",
      'migrate = "d:mig"',
      "[tool.hatch.envs.default.scripts]",
      'test = "pytest"',
      "[tool.black]",
      "line-length = 88",
    ].join("\n");
    const s = parsePyprojectScripts(toml);
    expect(s.sort()).toEqual(["demo", "migrate", "test"]);
    // Keys from unrelated tables aren't collected.
    expect(s).not.toContain("line-length");
  });
});

describe("parseToxEnvlist", () => {
  it("parses envlist and testenv sections", () => {
    const ini = [
      "[tox]",
      "envlist = py311, py312, lint",
      "[testenv:lint]",
      "commands = ruff check .",
    ].join("\n");
    const e = parseToxEnvlist(ini);
    expect(e).toContain("py311");
    expect(e).toContain("py312");
    expect(e).toContain("lint");
  });
});

describe("PythonResolver", () => {
  const r = new PythonResolver();

  it("detects pyproject/tox repos", async () => {
    expect(await r.detect(fx("python-repo"))).toBe(true);
  });

  it("merges pyproject scripts and tox envs", async () => {
    const tasks = await r.tasks(fx("python-repo"));
    // pyproject scripts
    expect(tasks.has("demo-cli")).toBe(true);
    expect(tasks.has("serve")).toBe(true);
    expect(tasks.has("migrate")).toBe(true);
    expect(tasks.has("lint")).toBe(true);
    // tox envs
    expect(tasks.has("py311")).toBe(true);
  });
});

describe("commandTarget — polyglot runners", () => {
  it("make/just/task", () => {
    expect(commandTarget("make build")).toEqual({ task: "build", runner: "make" });
    expect(commandTarget("just deploy")).toEqual({ task: "deploy", runner: "just" });
  });
  it("poetry/uv run", () => {
    expect(commandTarget("poetry run test")).toEqual({ task: "test", runner: "poetry" });
    expect(commandTarget("uv run lint")).toEqual({ task: "lint", runner: "uv" });
  });
  it("tox -e / nox -s", () => {
    expect(commandTarget("tox -e py311")).toEqual({ task: "py311", runner: "tox" });
    expect(commandTarget("nox -s tests")).toEqual({ task: "tests", runner: "nox" });
  });
});

describe("integration: stale-command across ecosystems", () => {
  it("flags a missing Makefile target with a suggestion", async () => {
    const res = await lintSource(
      "```bash\nmake biuld\n```",
      fx("make-repo"),
      "AGENTS.md",
    );
    const f = res.findings.find((x) => x.rule === "stale-command");
    expect(f).toBeDefined();
    expect(f!.suggestion).toContain("build");
  });

  it("does not flag an existing Makefile target", async () => {
    const res = await lintSource(
      "```bash\nmake build\n```",
      fx("make-repo"),
      "AGENTS.md",
    );
    expect(res.findings.some((x) => x.rule === "stale-command")).toBe(false);
  });

  it("flags a missing poetry script", async () => {
    const res = await lintSource(
      "```bash\npoetry run nope\n```",
      fx("python-repo"),
      "AGENTS.md",
    );
    expect(res.findings.some((x) => x.rule === "stale-command")).toBe(true);
  });

  it("does not flag an existing tox env", async () => {
    const res = await lintSource(
      "```bash\ntox -e py311\n```",
      fx("python-repo"),
      "AGENTS.md",
    );
    expect(res.findings.some((x) => x.rule === "stale-command")).toBe(false);
  });
});
