/** Build the two ESM bins for the published `skillmark` npm package. */
import { chmodSync, mkdirSync, readFileSync } from "node:fs";

import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
mkdirSync("bin", { recursive: true });

const banner = {
  js: [
    "#!/usr/bin/env node",
    'import { createRequire as __skillmarkCreateRequire } from "node:module";',
    "const require = __skillmarkCreateRequire(import.meta.url);",
  ].join("\n"),
};

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  banner,
  // Keep native/asset-bearing packages (web-sdk → rust-bindings wasm) as normal deps.
  packages: "external",
};

await build({
  ...common,
  entryPoints: ["../cli/src/index.ts"],
  outfile: "bin/skillmark.mjs",
  define: { __SKILLMARK_VERSION__: JSON.stringify(pkg.version) },
});

await build({
  ...common,
  entryPoints: ["../../apps/mcp/src/bin.ts"],
  outfile: "bin/skillmark-mcp.mjs",
  define: { __SKILLMARK_VERSION__: JSON.stringify(pkg.version) },
});

for (const file of ["bin/skillmark.mjs", "bin/skillmark-mcp.mjs"]) chmodSync(file, 0o755);
console.log(`built skillmark@${pkg.version}`);
