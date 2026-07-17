import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not part of the Next.js build — a standalone, buildless browser
    // extension (see chrome-extension/README.md), including a vendored
    // third-party file (vendor/readability.js) we shouldn't be reformatting
    // or holding to this project's lint rules.
    "chrome-extension/**",
  ]),
]);

export default eslintConfig;
