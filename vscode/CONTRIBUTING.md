# Contributing to the Context Check extension

See the [root CONTRIBUTING guide](../CONTRIBUTING.md) for the project layout,
building, and how to add rules/resolvers.

## Local development

```bash
# from the repo root — build the core the extension bundles
npm install && npm run build

# then the extension
cd vscode && npm install && npm run build
```

Press **F5** in the `vscode/` folder to launch an Extension Development Host
against `vscode/demo-workspace/` (an `AGENTS.md` with intentional mistakes).

## Known limitations / future work

### Web extension support (vscode.dev)

The extension is currently **desktop-only** — it works in VS Code (desktop),
Cursor, VSCodium, etc., but the install is grayed out on
[vscode.dev](https://vscode.dev) and github.dev.

The reason: the bundled core (`contextcheck-cli`) uses Node APIs (`node:fs`,
`node:path`) that don't exist in a browser worker. Making it web-compatible
would require:

1. A filesystem abstraction in the core so it can read via either Node `fs`
   or the VS Code `workspace.fs` API.
2. Replacing `node:path` with a browser-safe path implementation.
3. A separate web bundle plus a `"browser"` entry and
   `"extensionKind": ["workspace", "web"]` in `package.json`.

Any future `git`-based features (e.g. staleness) would remain desktop-only,
since `child_process` isn't available in the browser.
