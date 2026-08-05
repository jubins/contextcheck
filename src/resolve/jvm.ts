import { join } from "node:path";
import type { Resolver, TaskInfo } from "./types.js";
import { pathExists, readTextSafe } from "./fs-utils.js";

/**
 * Best-effort Gradle task names from a build script. Gradle tasks can be
 * declared many ways; we capture the common `task foo`, `tasks.register("foo")`,
 * and Kotlin-DSL `tasks.register("foo")` / `val foo by tasks.registering` forms.
 */
export function parseGradleTasks(script: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /\btask\s+([A-Za-z][A-Za-z0-9_]*)/g, // task foo
    /tasks\.register(?:<[^>]+>)?\(\s*["']([^"']+)["']/g, // tasks.register("foo")
    /tasks\.create\(\s*["']([^"']+)["']/g, // tasks.create("foo")
    /val\s+([A-Za-z][A-Za-z0-9_]*)\s+by\s+tasks/g, // val foo by tasks.registering
  ];
  for (const re of patterns) {
    for (const m of script.matchAll(re)) {
      const name = m[1];
      if (name) names.add(name);
    }
  }
  return [...names];
}

/** Best-effort Maven profile ids from a pom.xml (`<profile><id>x</id>`). */
export function parseMavenProfiles(pom: string): string[] {
  const names = new Set<string>();
  for (const m of pom.matchAll(/<profile>[\s\S]*?<id>\s*([^<]+?)\s*<\/id>/g)) {
    const name = m[1];
    if (name) names.add(name.trim());
  }
  return [...names];
}

export class JvmResolver implements Resolver {
  readonly name = "jvm";

  async detect(repoRoot: string): Promise<boolean> {
    return (
      (await pathExists(join(repoRoot, "build.gradle"))) ||
      (await pathExists(join(repoRoot, "build.gradle.kts"))) ||
      (await pathExists(join(repoRoot, "pom.xml")))
    );
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const out = new Map<string, TaskInfo>();

    const gradle =
      (await readTextSafe(join(repoRoot, "build.gradle"))) ??
      (await readTextSafe(join(repoRoot, "build.gradle.kts")));
    if (gradle) {
      for (const name of parseGradleTasks(gradle)) {
        out.set(name, { name, source: this.name, detail: "gradle" });
      }
    }

    const pom = await readTextSafe(join(repoRoot, "pom.xml"));
    if (pom) {
      for (const name of parseMavenProfiles(pom)) {
        if (!out.has(name)) {
          out.set(name, { name, source: this.name, detail: "maven-profile" });
        }
      }
    }

    return out;
  }
}
