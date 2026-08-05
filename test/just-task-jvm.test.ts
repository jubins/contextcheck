import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  JustResolver,
  TaskResolver,
  JvmResolver,
  parseJustfileRecipes,
  parseTaskfileTasks,
  parseGradleTasks,
  parseMavenProfiles,
  commandTarget,
  lintSource,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

describe("parseJustfileRecipes", () => {
  const jf = [
    "set shell := [\"bash\"]",
    'version := "1.0"',
    "# comment",
    "build:",
    "    cargo build",
    "deploy env:",
    "    ./deploy.sh",
    "[private]",
    "_helper:",
    "    echo hi",
  ].join("\n");

  it("collects recipe names incl. those with params", () => {
    const r = parseJustfileRecipes(jf);
    expect(r).toContain("build");
    expect(r).toContain("deploy");
    expect(r).toContain("_helper");
  });
  it("excludes assignments and settings", () => {
    const r = parseJustfileRecipes(jf);
    expect(r).not.toContain("version");
    expect(r).not.toContain("set");
  });
});

describe("JustResolver", () => {
  const r = new JustResolver();
  it("detects and enumerates a justfile", async () => {
    expect(await r.detect(fx("just-repo"))).toBe(true);
    const tasks = await r.tasks(fx("just-repo"));
    expect(tasks.has("build")).toBe(true);
    expect(tasks.has("test")).toBe(true);
    expect(tasks.has("deploy")).toBe(true);
  });
});

describe("parseTaskfileTasks", () => {
  it("collects keys under tasks:", () => {
    const yml = [
      "version: '3'",
      "vars:",
      "  GREETING: Hello",
      "tasks:",
      "  build:",
      "    cmds: [go build]",
      "  test:",
      "    cmds: [go test]",
    ].join("\n");
    const t = parseTaskfileTasks(yml);
    expect(t.sort()).toEqual(["build", "test"]);
    expect(t).not.toContain("GREETING");
  });
});

describe("TaskResolver", () => {
  const r = new TaskResolver();
  it("detects and enumerates a Taskfile", async () => {
    expect(await r.detect(fx("task-repo"))).toBe(true);
    const tasks = await r.tasks(fx("task-repo"));
    expect([...tasks.keys()].sort()).toEqual(["build", "lint", "test"]);
  });
});

describe("parseGradleTasks / parseMavenProfiles", () => {
  it("parses task {} and tasks.register()", () => {
    const g = [
      "task hello {}",
      "tasks.register('integrationTest') {}",
      'tasks.create("docs") {}',
    ].join("\n");
    const t = parseGradleTasks(g);
    expect(t).toContain("hello");
    expect(t).toContain("integrationTest");
    expect(t).toContain("docs");
  });
  it("parses maven profile ids", () => {
    const pom =
      "<profiles><profile><id>ci</id></profile><profile><id>release</id></profile></profiles>";
    expect(parseMavenProfiles(pom).sort()).toEqual(["ci", "release"]);
  });
});

describe("JvmResolver", () => {
  const r = new JvmResolver();
  it("detects a gradle repo and reads tasks", async () => {
    expect(await r.detect(fx("gradle-repo"))).toBe(true);
    const tasks = await r.tasks(fx("gradle-repo"));
    expect(tasks.has("hello")).toBe(true);
    expect(tasks.has("integrationTest")).toBe(true);
  });
});

describe("commandTarget — just/task/gradle", () => {
  it("just and task runners", () => {
    expect(commandTarget("just build")).toEqual({ task: "build", runner: "just" });
    expect(commandTarget("task test")).toEqual({ task: "test", runner: "task" });
  });
  it("gradle and gradlew", () => {
    expect(commandTarget("gradle hello")).toEqual({ task: "hello", runner: "gradle" });
    expect(commandTarget("./gradlew integrationTest")).toEqual({
      task: "integrationTest",
      runner: "gradle",
    });
  });
});

describe("integration", () => {
  it("flags a missing justfile recipe", async () => {
    const res = await lintSource(
      "```bash\njust biuld\n```",
      fx("just-repo"),
      "AGENTS.md",
    );
    const f = res.findings.find((x) => x.rule === "stale-command");
    expect(f).toBeDefined();
    expect(f!.suggestion).toContain("build");
  });

  it("does not flag an existing Taskfile task", async () => {
    const res = await lintSource(
      "```bash\ntask lint\n```",
      fx("task-repo"),
      "AGENTS.md",
    );
    expect(res.findings.some((x) => x.rule === "stale-command")).toBe(false);
  });

  it("flags a missing gradle task", async () => {
    const res = await lintSource(
      "```bash\ngradle nope\n```",
      fx("gradle-repo"),
      "AGENTS.md",
    );
    expect(res.findings.some((x) => x.rule === "stale-command")).toBe(true);
  });
});
