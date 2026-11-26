/** Entry point for the distributed `skillmark-mcp` bin. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { applyRuntimeConfig } from "./config.ts";
import { renderProtection, runProtectedAudit, startAuditWatcher } from "./protection.ts";
import { createServer } from "./server.ts";
import { renderAudit } from "./tools/audit.ts";

declare const __SKILLMARK_VERSION__: string | undefined;
const VERSION = typeof __SKILLMARK_VERSION__ === "string" ? __SKILLMARK_VERSION__ : "0.3.1";
const command = process.argv[2];

if (command === "--version" || command === "-v") {
  console.log(VERSION);
} else {
  applyRuntimeConfig();
  const config = {
    indexUrl: process.env.SKILLMARK_INDEX_URL ?? "https://skillmark-index.onrender.com",
  };

  if (command === "audit") {
    const report = await runProtectedAudit(config);
    console.log(renderAudit(report));
  } else if (command === "status") {
    console.log(renderProtection());
  } else {
    startAuditWatcher(config);
    const transport = new StdioServerTransport();
    await createServer(config).connect(transport);
  }
}
