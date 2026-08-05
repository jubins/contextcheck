import { access, readFile } from "node:fs/promises";

/** Whether a path exists and is accessible. Never throws. */
export async function pathExists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

/** Read a UTF-8 file, or return undefined if it can't be read. Never throws. */
export async function readTextSafe(p: string): Promise<string | undefined> {
  return readFile(p, "utf8").then(
    (text) => text,
    () => undefined,
  );
}
