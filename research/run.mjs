#!/usr/bin/env node
/**
 * Corpus study harness. Runs contextcheck across many public repos and writes
 * tidy + long CSVs. Resumable, concurrency-limited, and defensive about clones.
 *
 * Usage: node research/run.mjs <repos.txt>
 * Not part of the shipped package.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..");
const CLI = join(REPO_ROOT, "dist", "cli.js");

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const CLONE_TIMEOUT_MS = Number(process.env.CLONE_TIMEOUT_MS ?? 60000);
const MAX_REPO_MB = Number(process.env.MAX_REPO_MB ?? 500);
const OUT_DIR = process.env.OUT_DIR ?? join(here, "out");
const TOKEN = process.env.GITHUB_TOKEN;

const REPOS_CSV = join(OUT_DIR, "repos.csv");
const FINDINGS_CSV = join(OUT_DIR, "findings.csv");
const CHECKPOINT = join(OUT_DIR, "checkpoint.json");
const LOG = join(OUT_DIR, "run.log");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  void appendFile(LOG, line + "\n").catch(() => {});
}

/** CSV-escape a value. */
function csv(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** owner/name from a GitHub URL. */
function parseRepo(url) {
  const m = url.trim().match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return m ? { owner: m[1], name: m[2], slug: `${m[1]}/${m[2]}` } : null;
}

async function loadCheckpoint() {
  if (!existsSync(CHECKPOINT)) return new Set();
  try {
    const done = JSON.parse(await readFile(CHECKPOINT, "utf8"));
    return new Set(Array.isArray(done) ? done : []);
  } catch {
    return new Set();
  }
}

async function saveCheckpoint(done) {
  await writeFile(CHECKPOINT, JSON.stringify([...done]));
}

/** GitHub API metadata (stars, language, pushed_at). Best-effort. */
async function repoMeta(slug) {
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    });
    if (!res.ok) return {};
    const j = await res.json();
    return {
      stars: j.stargazers_count,
      language: j.language,
      pushedAt: j.pushed_at,
      createdAt: j.created_at,
    };
  } catch {
    return {};
  }
}

/** Shallow-clone `slug` into a temp dir. Returns the dir, or null on failure. */
async function cloneRepo(slug) {
  const dir = await mkdtemp(join(tmpdir(), "corpus-"));
  try {
    await exec(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        `https://github.com/${slug}.git`,
        dir,
      ],
      { timeout: CLONE_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    );
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    log(`clone failed: ${slug} — ${String(err).slice(0, 120)}`);
    return null;
  }
  // Size guard.
  try {
    const { stdout } = await exec("du", ["-sm", dir]);
    const mb = Number(stdout.split("\t")[0]);
    if (mb > MAX_REPO_MB) {
      await rm(dir, { recursive: true, force: true });
      log(`skip (too big, ${mb}MB): ${slug}`);
      return null;
    }
  } catch {
    // du unavailable — proceed.
  }
  return dir;
}

/** Run contextcheck (recursive JSON) on a clone. Returns parsed results. */
async function runCheck(dir) {
  try {
    const { stdout } = await exec("node", [CLI, dir, "--recursive", "--format", "json"], {
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    // The CLI exits non-zero on findings; still has stdout JSON.
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

async function processRepo(slug) {
  const dir = await cloneRepo(slug);
  if (!dir) return { slug, skipped: true };
  try {
    const [checked, meta] = await Promise.all([runCheck(dir), repoMeta(slug)]);
    if (!checked) return { slug, skipped: true };

    const findings = checked.results.flatMap((r) =>
      r.findings.map((f) => ({ file: r.file, ...f })),
    );
    const counts = { error: 0, warn: 0, info: 0 };
    for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

    // Line count of the largest context file found.
    let maxLines = 0;
    for (const r of checked.results) {
      try {
        const text = await readFile(r.file, "utf8");
        maxLines = Math.max(maxLines, text.split("\n").length);
      } catch {
        /* ignore */
      }
    }

    return {
      slug,
      contextFiles: checked.results.length,
      findings: findings.length,
      ...counts,
      maxLines,
      stars: meta.stars,
      language: meta.language,
      pushedAt: meta.pushedAt,
      createdAt: meta.createdAt,
      findingRows: findings.map((f) => ({
        slug,
        file: f.file.replace(dir + "/", ""),
        rule: f.rule,
        severity: f.severity,
        line: f.line,
      })),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const listFile = process.argv[2];
  if (!listFile) {
    console.error("Usage: node research/run.mjs <repos.txt>");
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });
  if (!existsSync(CLI)) {
    console.error(`CLI not built: ${CLI}. Run "npm run build" first.`);
    process.exit(1);
  }

  const urls = (await readFile(listFile, "utf8"))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const slugs = [...new Set(urls.map(parseRepo).filter(Boolean).map((r) => r.slug))];

  const done = await loadCheckpoint();
  const todo = slugs.filter((s) => !done.has(s));
  log(`${slugs.length} repos (${todo.length} remaining after checkpoint)`);

  // Write CSV headers if the files are new.
  if (!existsSync(REPOS_CSV)) {
    await writeFile(
      REPOS_CSV,
      "slug,context_files,findings,error,warn,info,max_lines,stars,language,pushed_at,created_at\n",
    );
  }
  if (!existsSync(FINDINGS_CSV)) {
    await writeFile(FINDINGS_CSV, "slug,file,rule,severity,line\n");
  }

  // Concurrency-limited worker pool.
  let idx = 0;
  async function worker() {
    while (idx < todo.length) {
      const slug = todo[idx++];
      log(`(${idx}/${todo.length}) ${slug}`);
      try {
        const r = await processRepo(slug);
        if (!r.skipped) {
          await appendFile(
            REPOS_CSV,
            [
              r.slug,
              r.contextFiles,
              r.findings,
              r.error,
              r.warn,
              r.info,
              r.maxLines,
              r.stars,
              r.language,
              r.pushedAt,
              r.createdAt,
            ]
              .map(csv)
              .join(",") + "\n",
          );
          for (const fr of r.findingRows) {
            await appendFile(
              FINDINGS_CSV,
              [fr.slug, fr.file, fr.rule, fr.severity, fr.line].map(csv).join(",") + "\n",
            );
          }
        }
      } catch (err) {
        log(`error on ${slug}: ${String(err).slice(0, 120)}`);
      }
      done.add(slug);
      await saveCheckpoint(done);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker),
  );
  log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
