// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Build output, deps, fixtures, and the extension (linted separately).
    ignores: [
      "dist/**",
      "node_modules/**",
      "test/fixtures/**",
      "vscode/**",
      "action/**",
      "coverage/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The project uses strict TypeScript (noUncheckedIndexedAccess), which
      // makes indexed access possibly-undefined. The guards that satisfies
      // (`arr[i]!`, `x ?? ""`) get flagged by these rules, so they conflict
      // with our own type settings. tsc already enforces null-safety, so we
      // turn these off rather than fight the contradiction. Codacy runs ESLint
      // and respects this config, clearing the corresponding findings.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
