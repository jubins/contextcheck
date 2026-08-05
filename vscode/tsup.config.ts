import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  target: "node18",
  // vscode is provided by the host at runtime; never bundle it.
  external: ["vscode"],
  // Bundle the core into the extension so it ships self-contained. Must match
  // the package name the extension imports (contextcheck-cli); otherwise the
  // core is left as an external require() that the .vsix doesn't include, and
  // the extension fails to activate ("command not found").
  noExternal: ["contextcheck-cli"],
  clean: true,
  sourcemap: true,
});
