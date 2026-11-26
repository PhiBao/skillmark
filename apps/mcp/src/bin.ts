/** Entry point for the distributed `skillmark-mcp` bin. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { applyRuntimeConfig } from "./config.ts";
import { renderProtection, runProtectedAudit, startAuditWatcher } from "./protection.ts";
import { createServer } from "./server.ts";
import { renderAudit } from "./tools/audit.ts";

applyRuntimeConfig();
const config = {
  indexUrl: process.env.SKILLMARK_INDEX_URL ?? "https://skillmark-index.onrender.com",
};

if (process.argv[2] === "audit") {
  const report = await runProtectedAudit(config);
  console.log(renderAudit(report));
} else if (process.argv[2] === "status") {
  console.log(renderProtection());
} else {
  startAuditWatcher(config);
  const transport = new StdioServerTransport();
  await createServer(config).connect(transport);
}
