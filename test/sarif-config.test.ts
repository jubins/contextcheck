import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { renderSarif, lintFile, lintSource, loadConfig } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

describe("renderSarif", () => {
  it("produces a valid SARIF 2.1.0 shape", async () => {
    const res = await lintSource(
      "```bash\nnpm run biuld\n```",
      fx("npm-repo"),
      join(fx("npm-repo"), "AGENTS.md"),
    );
    const sarif = JSON.parse(renderSarif([res], fx("npm-repo")));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.name).toBe("Context Check");
    expect(Array.isArray(sarif.runs[0].tool.driver.rules)).toBe(true);
    const stale = sarif.runs[0].results.find(
      (r: { ruleId: string }) => r.ruleId === "stale-command",
    );
    expect(stale.level).toBe("error");
    expect(stale.locations[0].physicalLocation.artifactLocation.uri).toBe(
      "AGENTS.md",
    );
  });

  it("maps severities to SARIF levels", async () => {
    const res = await lintSource(
      "Handlers live in src/gone/index.ts today.", // low-confidence -> warn
      fx("npm-repo"),
      join(fx("npm-repo"), "AGENTS.md"),
    );
    const sarif = JSON.parse(renderSarif([res], fx("npm-repo")));
    const dead = sarif.runs[0].results.find(
      (r: { ruleId: string }) => r.ruleId === "dead-path",
    );
    expect(dead.level).toBe("warning");
  });
});

describe("config file (.contextcheckrc.json)", () => {
  const dir = fx("config-repo");
  const rc = join(dir, ".contextcheckrc.json");

  beforeAll(async () => {
    // Build a tiny repo on the fly.
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "cfg", scripts: { build: "tsc" } }, null, 2),
    );
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loadConfig returns {} when absent", async () => {
    const cfg = await loadConfig(fx("npm-repo"));
    expect(cfg.rules).toBeUndefined();
  });

  it("disables a rule via config", async () => {
    await writeFile(rc, JSON.stringify({ rules: { "stale-command": false } }));
    await writeFile(join(dir, "AGENTS.md"), "```bash\nnpm run nope\n```");
    const res = await lintFile(join(dir, "AGENTS.md"), dir);
    expect(res.findings.some((f) => f.rule === "stale-command")).toBe(false);
  });

  it("applies a severity override via config", async () => {
    await writeFile(rc, JSON.stringify({ severity: { "undocumented-task": "warn" } }));
    await writeFile(join(dir, "AGENTS.md"), "# Demo\n\nNo commands here.");
    const res = await lintFile(join(dir, "AGENTS.md"), dir);
    const undoc = res.findings.find((f) => f.rule === "undocumented-task");
    expect(undoc?.severity).toBe("warn"); // default is info
  });

  it("ignore patterns drop matching files", async () => {
    await writeFile(rc, JSON.stringify({ ignore: ["AGENTS.md"] }));
    await writeFile(join(dir, "AGENTS.md"), "```bash\nnpm run nope\n```");
    const res = await lintFile(join(dir, "AGENTS.md"), dir);
    expect(res.findings).toHaveLength(0);
  });
});
