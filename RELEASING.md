# Releasing

The npm package (`contextcheck-cli`) and the VS Code extension
(`jubinsoni.contextcheck`) are versioned **in lockstep** and published
automatically by [`.github/workflows/release.yml`](.github/workflows/release.yml)
when a `v*` tag is pushed.

## One-time setup: GitHub secrets

Add these under **Settings → Secrets and variables → Actions** in the GitHub repo:

| Secret | What it is | How to get it |
|---|---|---|
| `NPM_TOKEN` | npm granular access token with **Read and write** and **Bypass 2FA** enabled | npmjs.com → Access Tokens → Granular → scope to `contextcheck-cli`, read/write, Bypass 2FA = true |
| `VSCE_PAT` | Azure DevOps Personal Access Token, **Marketplace → Manage** scope | dev.azure.com → User settings → Personal Access Tokens → All accessible organizations |
| `OVSX_PAT` *(optional)* | Open VSX access token | open-vsx.org → Access Tokens. Omit to skip Open VSX. |

> The npm token needs **Bypass 2FA** because this account enforces 2FA on write
> actions and CI can't answer an interactive 2FA challenge.

## Cutting a release

### Option A — from GitHub (recommended)

1. **Actions** tab → **Release** workflow → **Run workflow**.
2. Pick the bump: **patch**, **minor**, or **major**.
3. Run.

The workflow bumps **both** `package.json` files in lockstep, commits
`Release vX.Y.Z`, tags and pushes it, then publishes and creates the GitHub
Release — no local steps. (Nothing published if versions are already live.)

### Option B — locally

From a clean `master`:

```bash
npm run release -- patch      # or: minor | major | 0.2.0
git push && git push origin vX.Y.Z
```

This bumps both `package.json` files, commits `Release vX.Y.Z`, and tags it.
Pushing the tag triggers the same workflow.

### In both cases the workflow:

1. **Verifies** the tag matches both `package.json` versions (fails otherwise).
2. Runs typecheck, tests, and builds (core + extension).
3. Publishes `contextcheck-cli` to npm.
4. Publishes the extension to the VS Code Marketplace (and Open VSX if
   `OVSX_PAT` is set).
5. Creates the GitHub Release, and **re-points the major-version tag**
   (`v1`, `v2`, …) at this commit.

## If a release fails

The pipeline is safe to retry:

- **`npm run release` rolls back** the version bump (both `package.json` files,
  the commit, and the tag) if the local commit/tag step fails — so a rerun
  starts from the previous version, never a double-bump.
- **The publish steps are idempotent.** If a run publishes to npm but the
  extension step fails, re-running the workflow (or pushing the tag again) skips
  the npm publish (that version is already live) and retries only the extension.
  Neither publish errors out on an already-published version.

So after a partial failure, fix the cause (e.g. an expired `VSCE_PAT`) and
re-run the workflow on the same tag — it completes only the missing pieces.

## The GitHub Action's moving major tag

External users reference the Action by its **major** version — currently
`jubins/contextcheck/action@v0` — a *moving* tag that always points at the
latest release in that major line, so they get patches without pinning. The
release workflow moves it automatically (step 5 above), deriving the tag from
the package version: `0.1.5` keeps `v0` current, `1.x` would keep `v1` current.

Because the tag tracks the major version, the docs must reference the major we
are actually shipping. While the packages are on `0.x`, every example uses
`@v0`. When you cut `1.0.0`, the workflow starts publishing a `v1` tag — at that
point update the `@v0` references in `README.md` and `action/README.md` to
`@v1`. Same again for any future major.

## Before the first automated release

Update the changelog (`vscode/CHANGELOG.md`) for the new version, then cut the
release. The changelog ships in the extension's Marketplace listing.

## Manual fallback

If you ever need to publish by hand:

```bash
# npm
npm run build && npm publish --access public

# extension
cd vscode && npx @vscode/vsce publish --no-dependencies
```
