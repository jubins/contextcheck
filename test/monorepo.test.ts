import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  lintWorkspace,
  findAllContextFiles,
  checkCrossFileContradictions,
} from "../src/index.js";

describe("findAllContextFiles", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "ctxcheck-mono-"));
    await mkdir(join(root, "packages", "api"), { recursive: true });
    await mkdir(join(root, "node_modules", "dep"), { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "# root");
    await writeFile(join(root, "packages", "api", "AGENTS.md"), "# api");
    // Should be skipped (inside node_modules).
    await writeFile(join(root, "node_modules", "dep", "AGENTS.md"), "# dep");
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds nested files but skips node_modules", async () => {
    const files = await findAllContextFiles(root);
    expect(files.some((f) => f.endsWith("packages/api/AGENTS.md"))).toBe(true);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });

  it("orders root files before nested", async () => {
    const files = await findAllContextFiles(root);
    expect(files[0]!.endsWith(join(root, "AGENTS.md").slice(-8))).toBe(true);
  });
});

describe("checkCrossFileContradictions", () => {
  it("flags two files documenting the same task differently", () => {
    const byFile = checkCrossFileContradictions([
      { file: "/r/AGENTS.md", source: "```bash\nnpm run build\n```" },
      { file: "/r/CLAUDE.md", source: "```bash\nmake build\n```" },
    ]);
    expect(byFile.get("/r/AGENTS.md")?.[0]?.rule).toBe(
      "cross-file-contradiction",
    );
  });

  it("does not flag agreeing files", () => {
    const byFile = checkCrossFileContradictions([
      { file: "/r/AGENTS.md", source: "```bash\nnpm run build\n```" },
      { file: "/r/CLAUDE.md", source: "```bash\nnpm run build\n```" },
    ]);
    expect(byFile.size).toBe(0);
  });

  it("ignores the bridge pattern (@AGENTS.md)", () => {
    const byFile = checkCrossFileContradictions([
      { file: "/r/AGENTS.md", source: "```bash\nnpm run build\n```" },
      { file: "/r/CLAUDE.md", source: "@AGENTS.md\n" },
    ]);
    expect(byFile.size).toBe(0);
  });

  it("does not compare files in different directories", () => {
    const byFile = checkCrossFileContradictions([
      { file: "/r/AGENTS.md", source: "```bash\nnpm run build\n```" },
      { file: "/r/pkg/AGENTS.md", source: "```bash\nmake build\n```" },
    ]);
    expect(byFile.size).toBe(0);
  });
});

describe("lintWorkspace — nested scope + contradictions", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "ctxcheck-ws-"));
    await mkdir(join(root, "packages", "api"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      '{"name":"root","scripts":{"build":"tsc"}}',
    );
    await writeFile(join(root, "AGENTS.md"), "```bash\nnpm run build\n```");
    await writeFile(join(root, "CLAUDE.md"), "```bash\nmake build\n```");
    // Nested package with its own manifest; the command resolves there.
    await writeFile(
      join(root, "packages", "api", "package.json"),
      '{"name":"api","scripts":{"serve":"node ."}}',
    );
    await writeFile(
      join(root, "packages", "api", "AGENTS.md"),
      "```bash\nnpm run serve\n```",
    );
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("flags a root cross-file contradiction", async () => {
    const results = await lintWorkspace(root);
    const rootAgents = results.find((r) => r.file.endsWith("/AGENTS.md") && !r.file.includes("api"));
    expect(
      rootAgents?.findings.some((f) => f.rule === "cross-file-contradiction"),
    ).toBe(true);
  });

  it("resolves a nested command against the nested manifest (no false positive)", async () => {
    const results = await lintWorkspace(root);
    const api = results.find((r) => r.file.includes("api"));
    expect(api?.findings.some((f) => f.rule === "stale-command")).toBe(false);
  });
});
