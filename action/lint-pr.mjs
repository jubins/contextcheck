#!/usr/bin/env node
/**
 * Context Check PR runner.
 *
 * Lints the repo's agent context files, then posts (or updates) a single
 * sticky comment on the pull request summarising the findings. Also warns
 * when a PR changes a manifest (package.json, etc.) but does not touch any
 * context file — the recurring drift trigger this tool exists for.
 *
 * Inputs come from env vars set by action.yml:
 *   CTX_SEVERITY_THRESHOLD  error | warn | info | none  (fail-the-check level)
 *   CTX_WORKING_DIRECTORY   directory to lint (default ".")
 *   GITHUB_TOKEN            token for the GitHub API
 * Plus the standard GITHUB_* event vars.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Load the library from the globally-installed contextcheck-cli. We import by
// an explicit path (not a bare specifier) so Node can never resolve it to this
// repo when the Action dogfoods itself — the repo's own package is also named
// contextcheck-cli. CTX_CLI_ENTRY is set by action.yml.
const cliEntry = process.env.CTX_CLI_ENTRY;
if (!cliEntry) {
  console.error("CTX_CLI_ENTRY is not set; cannot locate contextcheck-cli.");
  process.exit(1);
}
const { lintFile, findContextFiles, worstSeverity } = await import(
  pathToFileURL(cliEntry).href
);

const MARKER = "<!-- contextcheck-report -->";
const SEVERITY_RANK = new Map([
  ["info", 1],
  ["warn", 2],
  ["error", 3],
]);

const workingDir = resolve(process.env.CTX_WORKING_DIRECTORY || ".");
const threshold = (process.env.CTX_SEVERITY_THRESHOLD || "none").toLowerCase();
const token = process.env.GITHUB_TOKEN;

/** Manifest files whose changes tend to invalidate context-file claims. */
const MANIFESTS = [
  "package.json",
  "pnpm-workspace.yaml",
  "pyproject.toml",
  "tox.ini",
  "Cargo.toml",
  "go.mod",
  "Makefile",
  "justfile",
  "Taskfile.yml",
  "build.gradle",
  "pom.xml",
];

const CONTEXT_BASENAMES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules"];

function sh(cmd, args) {
  // Run git in the working directory so the diff targets the right repo.
  // Silence stderr — callers treat any failure as "no changed files".
  return execFileSync(cmd, args, {
    encoding: "utf8",
    cwd: workingDir,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** Files changed in this PR, relative to the merge base. */
function changedFiles() {
  const base = process.env.GITHUB_BASE_REF;
  try {
    // The Action fetches base; compare base...HEAD.
    const range = base ? `origin/${base}...HEAD` : "HEAD~1...HEAD";
    const out = sh("git", ["diff", "--name-only", range]);
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isManifest(path) {
  const name = path.split("/").pop();
  return MANIFESTS.includes(name);
}

function isContextFile(path) {
  const name = path.split("/").pop();
  return CONTEXT_BASENAMES.includes(name);
}

function severityEmoji(sev) {
  return sev === "error" ? "🔴" : sev === "warn" ? "🟡" : "🔵";
}

async function main() {
  const files = await findContextFiles(workingDir);
  const results = [];
  for (const file of files) {
    results.push(await lintFile(file, workingDir));
  }

  const allFindings = results.flatMap((r) =>
    r.findings.map((f) => ({ file: r.file, ...f })),
  );

  const changed = changedFiles();
  const changedManifests = changed.filter(isManifest);
  const changedContext = changed.filter(isContextFile);
  const driftWarning =
    changedManifests.length > 0 && changedContext.length === 0;

  const body = buildComment({
    results,
    allFindings,
    driftWarning,
    changedManifests,
  });

  if (token && process.env.GITHUB_EVENT_NAME === "pull_request") {
    await upsertComment(body);
  } else {
    // No PR context (e.g. push): just print the report.
    console.log(body.replace(MARKER, "").trim());
  }

  // Decide exit code from the threshold.
  if (threshold !== "none") {
    const worst = worstSeverity(results);
    if (
      worst &&
      (SEVERITY_RANK.get(worst) ?? 0) >= (SEVERITY_RANK.get(threshold) ?? 99)
    ) {
      console.error(
        `Context Check: found ${worst}-level findings at or above the '${threshold}' threshold.`,
      );
      process.exitCode = 1;
    }
  }
}

function buildComment({ results, allFindings, driftWarning, changedManifests }) {
  const lines = [MARKER, "## Context Check", ""];

  if (driftWarning) {
    lines.push(
      `> ⚠️ This PR changes ${changedManifests
        .map((m) => `\`${m}\``)
        .join(", ")} but does not touch any context file (\`AGENTS.md\` / \`CLAUDE.md\`).`,
      "> Double-check that the commands and paths documented for your agent are still accurate.",
      "",
    );
  }

  if (allFindings.length === 0) {
    lines.push(
      results.length === 0
        ? "No context files found to check."
        : "✅ No issues found in your context files.",
    );
    return lines.join("\n");
  }

  const counts = new Map();
  for (const f of allFindings) {
    counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  }
  const summary = ["error", "warn", "info"]
    .filter((s) => counts.has(s))
    .map((s) => `${severityEmoji(s)} ${counts.get(s)} ${s}`)
    .join(" · ");
  lines.push(`Found **${allFindings.length}** issue(s): ${summary}`, "");

  for (const r of results) {
    if (r.findings.length === 0) continue;
    const rel = r.file.replace(workingDir + "/", "");
    lines.push(`### \`${rel}\``, "");
    lines.push("| | Line | Rule | Message |", "|---|---|---|---|");
    for (const f of r.findings) {
      const msg = f.suggestion ? `${f.message} — ${f.suggestion}` : f.message;
      lines.push(
        `| ${severityEmoji(f.severity)} | ${f.line} | \`${f.rule}\` | ${msg.replace(/\|/g, "\\|")} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "",
    "_Posted by [Context Check](https://github.com/jubins/contextcheck) — lint your AGENTS.md against the real repo._",
  );
  return lines.join("\n");
}

/** GitHub REST helper. */
async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${method} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Read and parse the GitHub event payload, or null if unavailable. */
function readEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  // Only ever read the path GitHub itself provides in the Action environment.
  if (typeof eventPath !== "string" || eventPath.length === 0) return null;
  try {
    return JSON.parse(readFileSync(eventPath, "utf8"));
  } catch {
    return null;
  }
}

/** Post a new sticky comment, or update the existing one (found by marker). */
async function upsertComment(body) {
  const event = readEventPayload();
  const pr = event?.pull_request?.number;
  const repo = process.env.GITHUB_REPOSITORY; // owner/name
  if (!pr || !repo) {
    console.log(body.replace(MARKER, "").trim());
    return;
  }

  const existing = await gh(
    "GET",
    `/repos/${repo}/issues/${pr}/comments?per_page=100`,
  );
  const mine = existing.find((c) => c.body?.includes(MARKER));

  if (mine) {
    await gh("PATCH", `/repos/${repo}/issues/comments/${mine.id}`, { body });
    console.log(`Updated existing Context Check comment (#${mine.id}).`);
  } else {
    await gh("POST", `/repos/${repo}/issues/${pr}/comments`, { body });
    console.log("Posted a new Context Check comment.");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
