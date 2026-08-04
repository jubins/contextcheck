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

From a clean `master`:

```bash
npm run release -- patch      # or: minor | major | 0.2.0
```

This bumps **both** `package.json` files to the same version, commits
`Release vX.Y.Z`, and creates the `vX.Y.Z` tag. Then push:

```bash
git push && git push origin vX.Y.Z
```

Pushing the tag triggers the workflow, which:

1. **Verifies** the tag matches both `package.json` versions (fails otherwise).
2. Runs typecheck, tests, and builds (core + extension).
3. Publishes `contextcheck-cli` to npm.
4. Publishes the extension to the VS Code Marketplace (and Open VSX if
   `OVSX_PAT` is set).

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
