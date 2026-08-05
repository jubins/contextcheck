import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeStaleness, lintFile } from "../src/index.js";

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

describe("computeStaleness", () => {
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "ctxcheck-git-"));
    git(repo, "init");
    git(repo, "config", "user.email", "t@t.co");
    git(repo, "config", "user.name", "t");
    await writeFile(join(repo, "AGENTS.md"), "# Demo\n");
    await writeFile(join(repo, "package.json"), '{"name":"x"}\n');
    git(repo, "add", "-A");
    git(repo, "commit", "-m", "init");
    // 12 commits that each touch the manifest.
    for (let i = 1; i <= 12; i++) {
      await writeFile(join(repo, "package.json"), `{"name":"x","v":${i}}\n`);
      git(repo, "add", "package.json");
      git(repo, "commit", "-m", `m${i}`);
    }
  });

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("counts commits and manifest commits since the file changed", async () => {
    const s = await computeStaleness(repo, "AGENTS.md");
    expect(s).not.toBeNull();
    expect(s!.commitsSince).toBe(12);
    expect(s!.manifestCommitsSince).toBe(12);
    expect(s!.lastModified).toBeTruthy();
  });

  it("emits a staleness finding at info above 10 manifest commits", async () => {
    const res = await lintFile(join(repo, "AGENTS.md"), repo);
    const st = res.findings.find((f) => f.rule === "staleness");
    expect(st).toBeDefined();
    expect(st!.severity).toBe("info"); // 12 is >10 but <=30
  });

  it("respects a disabled staleness rule", async () => {
    const res = await lintFile(join(repo, "AGENTS.md"), repo, {
      rules: { staleness: false },
    });
    expect(res.findings.some((f) => f.rule === "staleness")).toBe(false);
  });
});

describe("computeStaleness — non-git dir", () => {
  it("returns null for a plain temp dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ctxcheck-nogit-"));
    try {
      const s = await computeStaleness(dir, "AGENTS.md");
      expect(s).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
