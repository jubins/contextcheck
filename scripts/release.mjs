#!/usr/bin/env node
/**
 * Cut a lockstep release: bump the version in both package.json (npm core) and
 * vscode/package.json (extension), commit, and create a matching v<version>
 * git tag. Pushing the tag triggers .github/workflows/release.yml, which
 * publishes to npm and the VS Code Marketplace.
 *
 * Usage:
 *   npm run release -- <patch|minor|major|x.y.z>
 *
 * It does NOT push — review, then `git push && git push --tags`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npm run release -- <patch|minor|major|x.y.z>");
  process.exit(1);
}

const CORE = "package.json";
const EXT = "vscode/package.json";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const write = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + "\n");

function bump(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind; // explicit version
  const [maj, min, pat] = current.split(".").map(Number);
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  if (kind === "patch") return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Unknown bump: ${kind}`);
}

// Refuse to release with a dirty tree.
const status = execSync("git status --porcelain").toString().trim();
if (status) {
  console.error("Working tree is not clean. Commit or stash first:\n" + status);
  process.exit(1);
}

const core = read(CORE);
const ext = read(EXT);
if (core.version !== ext.version) {
  console.error(
    `Versions are out of sync before release: core=${core.version} ext=${ext.version}. Align them first.`,
  );
  process.exit(1);
}

const next = bump(core.version, arg);
core.version = next;
ext.version = next;
write(CORE, core);
write(EXT, ext);

execSync(`git add ${CORE} ${EXT}`);
execSync(`git commit -m "Release v${next}"`, { stdio: "inherit" });
execSync(`git tag v${next}`, { stdio: "inherit" });

console.log(`\nBumped to ${next} and tagged v${next}.`);
console.log("Review, then push to trigger the release workflow:");
console.log("  git push && git push origin v" + next);
