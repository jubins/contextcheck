import { join } from "node:path";
import type { Resolver, TaskInfo } from "./types.js";
import { pathExists, readTextSafe } from "./fs-utils.js";

const TASKFILE_NAMES = [
  "Taskfile.yml",
  "Taskfile.yaml",
  "taskfile.yml",
  "taskfile.yaml",
];

async function readTaskfile(repoRoot: string): Promise<string | undefined> {
  for (const name of TASKFILE_NAMES) {
    const p = join(repoRoot, name);
    if (await pathExists(p)) {
      return readTextSafe(p);
    }
  }
  return undefined;
}

/**
 * Parse task names from a Taskfile without a full YAML parser. Task names are
 * the keys nested one level under a top-level `tasks:` mapping:
 *
 *   tasks:
 *     build:
 *       cmds: [...]
 *     test:
 *       ...
 *
 * We track the indentation of the first key under `tasks:` and collect keys at
 * exactly that indent, stopping when indentation returns to column 0 (a new
 * top-level section).
 */
export function parseTaskfileTasks(text: string): string[] {
  const lines = text.split("\n");
  const names: string[] = [];
  let inTasks = false;
  let taskIndent: number | null = null;

  for (const rawLine of lines) {
    if (rawLine.trim().length === 0 || rawLine.trim().startsWith("#")) continue;
    const indent = rawLine.length - rawLine.trimStart().length;

    if (!inTasks) {
      if (/^tasks\s*:/.test(rawLine)) inTasks = true;
      continue;
    }

    // A new top-level key ends the tasks block.
    if (indent === 0) break;

    // The first nested key sets the task indent level.
    if (taskIndent === null) taskIndent = indent;
    if (indent !== taskIndent) continue;

    const m = rawLine.trim().match(/^([A-Za-z0-9_.:-]+)\s*:/);
    const name = m?.[1];
    if (name) names.push(name);
  }
  return names;
}

export class TaskResolver implements Resolver {
  readonly name = "task";

  async detect(repoRoot: string): Promise<boolean> {
    return (await readTaskfile(repoRoot)) !== undefined;
  }

  async tasks(repoRoot: string): Promise<Map<string, TaskInfo>> {
    const text = await readTaskfile(repoRoot);
    const out = new Map<string, TaskInfo>();
    if (!text) return out;
    for (const name of parseTaskfileTasks(text)) {
      out.set(name, { name, source: this.name });
    }
    return out;
  }
}
