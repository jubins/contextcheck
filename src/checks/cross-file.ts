import { dirname, basename } from "node:path";
import type { Claim, Finding } from "../types.js";
import { extractClaims } from "../extract/index.js";
import { commandTarget } from "./command-target.js";

/** A context file paired with its raw source, for cross-file analysis. */
export interface ContextFileInput {
  file: string;
  source: string;
}

/** The set of command task-names a file documents, plus its raw commands. */
interface FileCommands {
  file: string;
  tasks: Map<string, string>; // task name -> raw command
}

/**
 * Detect the "bridge" pattern where a CLAUDE.md just points at AGENTS.md
 * (contains only `@AGENTS.md`, or is a near-empty include). Such files should
 * never be flagged as contradicting their sibling.
 */
function isBridgeFile(source: string): boolean {
  const meaningful = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (meaningful.length === 0) return true;
  // Only an @include reference (e.g. "@AGENTS.md").
  return meaningful.every((l) => /^@[\w./-]+$/.test(l));
}

function collectTasks(input: ContextFileInput): FileCommands {
  const tasks = new Map<string, string>();
  for (const claim of extractClaims(input.source) as Claim[]) {
    if (claim.kind !== "command") continue;
    const target = commandTarget(claim.value);
    if (target) tasks.set(target.task, claim.value);
  }
  return { file: input.file, tasks };
}

/**
 * The `cross-file-contradiction` rule: two sibling context files in the same
 * directory document the *same* task with a *different* command (e.g. root
 * AGENTS.md says `npm run build`, root CLAUDE.md says `make build`). Error.
 *
 * Skips bridge files (CLAUDE.md that just references AGENTS.md). Only compares
 * files in the same directory (nested files legitimately scope-override).
 */
export function checkCrossFileContradictions(
  inputs: ContextFileInput[],
): Map<string, Finding[]> {
  const byDir = new Map<string, ContextFileInput[]>();
  for (const input of inputs) {
    if (isBridgeFile(input.source)) continue;
    const dir = dirname(input.file);
    const list = byDir.get(dir) ?? [];
    list.push(input);
    byDir.set(dir, list);
  }

  const findingsByFile = new Map<string, Finding[]>();
  const add = (file: string, finding: Finding) => {
    const list = findingsByFile.get(file) ?? [];
    list.push(finding);
    findingsByFile.set(file, list);
  };

  for (const group of byDir.values()) {
    if (group.length < 2) continue;
    const parsed = group.map(collectTasks);
    // Compare every pair in the directory.
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const a = parsed[i]!;
        const b = parsed[j]!;
        for (const [task, cmdA] of a.tasks) {
          const cmdB = b.tasks.get(task);
          if (cmdB && cmdB !== cmdA) {
            add(a.file, {
              rule: "cross-file-contradiction",
              severity: "error",
              message: `\`${task}\` is documented as \`${cmdA}\` here but \`${cmdB}\` in ${basename(b.file)}`,
              line: 1,
              column: 1,
              fixable: false,
            });
          }
        }
      }
    }
  }

  return findingsByFile;
}
