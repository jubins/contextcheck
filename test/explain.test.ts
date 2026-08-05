import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { explainResults } from "../src/index.js";
import type { LintResult } from "../src/index.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.ANTHROPIC_API_KEY;
});

function fakeFetch(text: string, ok = true, status = 200) {
  return vi.fn(async () =>
    ({
      ok,
      status,
      async json() {
        return { content: [{ type: "text", text }] };
      },
      async text() {
        return text;
      },
    }) as unknown as Response,
  );
}

const result = (file: string): LintResult => ({
  file,
  findings: [
    {
      rule: "stale-command",
      severity: "error",
      message: "command `npm run biuld` not found",
      line: 4,
      column: 1,
      suggestion: "did you mean `build`?",
      fixable: true,
    },
  ],
});

describe("explainResults", () => {
  it("throws a clear error when no API key is set", async () => {
    await expect(explainResults([result("AGENTS.md")])).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("extracts a fenced diff from the model response", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ctxcheck-explain-"));
    try {
      const file = join(dir, "AGENTS.md");
      await writeFile(file, "```bash\nnpm run biuld\n```\n");
      const diff = "--- AGENTS.md\n+++ AGENTS.md\n@@\n-npm run biuld\n+npm run build";
      globalThis.fetch = fakeFetch("Here:\n```diff\n" + diff + "\n```");
      const out = await explainResults([result(file)], { apiKey: "sk-test" });
      expect(out[0]!.diff).toContain("npm run build");
      expect(out[0]!.error).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips files with no findings", async () => {
    globalThis.fetch = fakeFetch("```diff\n--- x\n+++ x\n```");
    const out = await explainResults(
      [{ file: "clean.md", findings: [] }],
      { apiKey: "sk-test" },
    );
    expect(out).toHaveLength(0);
  });

  it("records an error instead of throwing when the API call fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ctxcheck-explain-"));
    try {
      const file = join(dir, "AGENTS.md");
      await writeFile(file, "# x");
      globalThis.fetch = fakeFetch("rate limited", false, 429);
      const out = await explainResults([result(file)], { apiKey: "sk-test" });
      expect(out[0]!.diff).toBeNull();
      expect(out[0]!.error).toContain("429");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
