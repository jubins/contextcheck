import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  RustResolver,
  GoResolver,
  parseArrayOfTableNames,
  parseCargoAliases,
  parseGoModule,
  commandTarget,
  lintSource,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

describe("parseArrayOfTableNames", () => {
  const toml = [
    "[package]",
    'name = "demo"',
    "[[bin]]",
    'name = "server"',
    "[[bin]]",
    'name = "cli"',
    "[[example]]",
    'name = "hello"',
    "[dependencies]",
    'serde = "1"',
  ].join("\n");

  it("collects bin names", () => {
    expect(parseArrayOfTableNames(toml, "bin").sort()).toEqual(["cli", "server"]);
  });
  it("collects example names", () => {
    expect(parseArrayOfTableNames(toml, "example")).toEqual(["hello"]);
  });
  it("does not leak dependency keys", () => {
    expect(parseArrayOfTableNames(toml, "bin")).not.toContain("serde");
  });
});

describe("parseCargoAliases", () => {
  it("reads the [alias] table keys", () => {
    const cfg = ['[alias]', 'xtask = "run"', 'lint = "clippy"'].join("\n");
    expect(parseCargoAliases(cfg).sort()).toEqual(["lint", "xtask"]);
  });
});

describe("RustResolver", () => {
  const r = new RustResolver();

  it("detects a Cargo repo", async () => {
    expect(await r.detect(fx("rust-repo"))).toBe(true);
  });
  it("returns false without Cargo.toml", async () => {
    expect(await r.detect(fx("go-repo"))).toBe(false);
  });
  it("enumerates bins, examples, and aliases", async () => {
    const tasks = await r.tasks(fx("rust-repo"));
    expect(tasks.has("server")).toBe(true);
    expect(tasks.has("cli")).toBe(true);
    expect(tasks.has("hello")).toBe(true);
    expect(tasks.has("xtask")).toBe(true);
    expect(tasks.has("lint")).toBe(true);
  });
});

describe("parseGoModule", () => {
  it("extracts the module path", () => {
    expect(parseGoModule("module github.com/x/y\n\ngo 1.22")).toBe(
      "github.com/x/y",
    );
  });
  it("undefined when absent", () => {
    expect(parseGoModule("go 1.22")).toBeUndefined();
  });
});

describe("GoResolver", () => {
  const r = new GoResolver();
  it("detects a go.mod repo and exposes the module path", async () => {
    expect(await r.detect(fx("go-repo"))).toBe(true);
    expect(r.getModulePath()).toBe("github.com/jubins/demo");
  });
  it("returns no tasks (Go has no named task system)", async () => {
    const tasks = await r.tasks();
    expect(tasks.size).toBe(0);
  });
});

describe("commandTarget — cargo", () => {
  it("maps --bin and --example", () => {
    expect(commandTarget("cargo run --bin server")).toEqual({
      task: "server",
      runner: "cargo",
    });
    expect(commandTarget("cargo run --example hello")).toEqual({
      task: "hello",
      runner: "cargo",
    });
  });
  it("maps a custom alias", () => {
    expect(commandTarget("cargo xtask")).toEqual({ task: "xtask", runner: "cargo" });
  });
  it("ignores cargo builtins", () => {
    expect(commandTarget("cargo build")).toBeUndefined();
    expect(commandTarget("cargo test")).toBeUndefined();
  });
});

describe("integration: rust stale-command", () => {
  it("flags a missing bin with a suggestion", async () => {
    const res = await lintSource(
      "```bash\ncargo run --bin servr\n```",
      fx("rust-repo"),
      "AGENTS.md",
    );
    const f = res.findings.find((x) => x.rule === "stale-command");
    expect(f).toBeDefined();
    expect(f!.suggestion).toContain("server");
  });

  it("does not flag an existing bin", async () => {
    const res = await lintSource(
      "```bash\ncargo run --bin cli\n```",
      fx("rust-repo"),
      "AGENTS.md",
    );
    expect(res.findings.some((x) => x.rule === "stale-command")).toBe(false);
  });

  it("does not flag cargo builtins", async () => {
    const res = await lintSource(
      "```bash\ncargo build && cargo test\n```",
      fx("rust-repo"),
      "AGENTS.md",
    );
    expect(res.findings.some((x) => x.rule === "stale-command")).toBe(false);
  });
});
