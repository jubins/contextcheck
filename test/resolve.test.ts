import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  NpmFamilyResolver,
  PathResolver,
  detectPackageManager,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

describe("NpmFamilyResolver", () => {
  const resolver = new NpmFamilyResolver();

  it("detects a package.json repo", async () => {
    expect(await resolver.detect(fx("npm-repo"))).toBe(true);
  });

  it("returns false when no package.json", async () => {
    expect(await resolver.detect(fx("paths-repo"))).toBe(false);
  });

  it("enumerates scripts as tasks", async () => {
    const tasks = await resolver.tasks(fx("npm-repo"));
    expect([...tasks.keys()].sort()).toEqual([
      "build",
      "build:prod",
      "lint",
      "test",
    ]);
    expect(tasks.get("build")?.detail).toBe("tsc");
    expect(tasks.get("build")?.source).toBe("npm-family");
  });

  it("empty map when a repo has no scripts", async () => {
    const tasks = await resolver.tasks(fx("paths-repo"));
    expect(tasks.size).toBe(0);
  });
});

describe("detectPackageManager", () => {
  it("detects npm from package-lock.json", async () => {
    expect(await detectPackageManager(fx("npm-repo"))).toBe("npm");
  });

  it("detects pnpm from pnpm-lock.yaml", async () => {
    expect(await detectPackageManager(fx("pnpm-repo"))).toBe("pnpm");
  });

  it("undefined when no lockfile", async () => {
    expect(await detectPackageManager(fx("paths-repo"))).toBeUndefined();
  });
});

describe("PathResolver", () => {
  const resolver = new PathResolver(fx("paths-repo"));

  it("resolves an existing nested file", async () => {
    const r = await resolver.resolve("src/services/auth.ts");
    expect(r.status).toBe("exists");
  });

  it("resolves an existing directory with trailing slash", async () => {
    const r = await resolver.resolve("src/services/");
    expect(r.status).toBe("exists");
  });

  it("reports missing for a nonexistent file", async () => {
    const r = await resolver.resolve("src/services/missing.ts");
    expect(r.status).toBe("missing");
  });

  it("reports case-mismatch for wrong casing", async () => {
    const r = await resolver.resolve("src/Services/auth.ts");
    expect(r.status).toBe("case-mismatch");
    expect(r.actual).toBe("services");
    expect(r.corrected).toBe("src/services/auth.ts");
  });

  it("normalizes windows-style separators", async () => {
    const r = await resolver.resolve("src\\services\\auth.ts");
    expect(r.status).toBe("exists");
  });

  it("flags a symlinked path as symlink and existing", async () => {
    const r = await resolver.resolve("src/linked-lib/index.ts");
    expect(r.status).toBe("exists");
    expect(r.symlink).toBe(true);
  });

  it("missing dir short-circuits", async () => {
    const r = await resolver.resolve("nope/deeper/file.ts");
    expect(r.status).toBe("missing");
  });
});
