import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  target: "node18",
  // vscode is provided by the host at runtime; never bundle it.
  external: ["vscode"],
  // Bundle the ctxcheck core into the extension so it ships self-contained.
  noExternal: ["ctxcheck"],
  clean: true,
  sourcemap: true,
});
