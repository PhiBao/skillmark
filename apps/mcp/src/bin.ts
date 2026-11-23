/** Entry point for the distributed `skillmark-mcp` bin. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { applyRuntimeConfig } from "./config.ts";
import { createServer } from "./server.ts";

applyRuntimeConfig();
const transport = new StdioServerTransport();
await createServer({
  indexUrl: process.env.SKILLMARK_INDEX_URL ?? "https://skillmark-index.onrender.com",
}).connect(transport);
