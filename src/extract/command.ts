import { KNOWN_RUNNERS, SHELL_PROMPT_PREFIXES } from "./patterns.js";

/**
 * A single logical command split out of a shell line, with the character
 * offset (0-based) where it starts within the original line. The offset lets
 * callers compute accurate columns for chained commands.
 */
export interface SplitCommand {
  text: string;
  offset: number;
}

/**
 * Strip a leading shell prompt (`$`, `#`, `>`) and following whitespace.
 * Returns the cleaned text and the offset consumed, so columns stay accurate.
 */
export function stripPrompt(line: string): { text: string; offset: number } {
  const trimmedStart = line.length - line.trimStart().length;
  const rest = line.slice(trimmedStart);
  for (const prefix of SHELL_PROMPT_PREFIXES) {
    if (rest === prefix || rest.startsWith(prefix + " ")) {
      const consumed = rest.startsWith(prefix + " ")
        ? prefix.length + 1
        : prefix.length;
      const afterPrefix = rest.slice(consumed);
      const extraWs = afterPrefix.length - afterPrefix.trimStart().length;
      return {
        text: afterPrefix.trimStart(),
        offset: trimmedStart + consumed + extraWs,
      };
    }
  }
  return { text: rest, offset: trimmedStart };
}

/**
 * Split a shell line on `&&`, `||`, `;`, and `|` into individual commands,
 * tracking each one's offset within the line. Quotes are respected so that
 * separators inside strings are not treated as boundaries.
 */
export function splitChain(line: string): SplitCommand[] {
  const result: SplitCommand[] = [];
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let start = 0;
  let i = 0;

  const push = (end: number) => {
    const raw = line.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text.length > 0) result.push({ text, offset: start + leading });
  };

  while (i < line.length) {
    const ch = line[i]!;
    const next = line[i + 1];
    if (quote) {
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    if (depth === 0) {
      if ((ch === "&" && next === "&") || (ch === "|" && next === "|")) {
        push(i);
        i += 2;
        start = i;
        continue;
      }
      if (ch === ";" || ch === "|") {
        push(i);
        i += 1;
        start = i;
        continue;
      }
    }
    i++;
  }
  push(line.length);
  return result;
}

/** The first whitespace-delimited token of a command, lowercased for lookup. */
export function firstToken(command: string): string {
  const match = command.match(/^\S+/);
  return match ? match[0] : "";
}

/** Does this command begin with a known runner? */
export function isKnownRunnerCommand(command: string): boolean {
  return KNOWN_RUNNERS.has(firstToken(command));
}

/**
 * Normalize a command for matching: collapse internal whitespace. We keep the
 * full invocation (runner + subcommand + args) since resolvers match on script
 * names, and the checker layer decides how much of it to compare.
 */
export function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}
