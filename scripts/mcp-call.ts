/**
 * Tiny MCP caller for rehearsals and acceptance runs.
 * Usage: pnpm tsx scripts/mcp-call.ts <tool> '<json args>' [profile]
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [tool, rawArgs = "{}", profile] = process.argv.slice(2);
if (!tool) throw new Error("usage: mcp-call.ts <tool> '<json args>' [profile]");

const env: Record<string, string> = {
  ...(process.env as Record<string, string>),
  SKILLMARK_INDEX_URL: process.env.SKILLMARK_INDEX_URL ?? "https://skillmark-index.onrender.com",
};
if (profile) {
  env.HERMES_PROFILE = profile;
  env.HERMES_HOME = join(homedir(), ".hermes", "profiles", profile);
  env.HERMES_WALLET_FILE = join(
    homedir(),
    ".skillmark",
    "wallets",
    `${profile === "buyer-b" ? "hermes-b" : profile}.export`,
  );
  env.SKILLMARK_STATE_DIR = join(homedir(), ".hermes", "profiles", profile, "skillmark");
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", join(process.cwd(), "apps", "mcp", "src", "server.ts")],
  env,
});
const client = new Client({ name: "skillmark-rehearsal", version: "1.0.0" });
await client.connect(transport);
const result = (await client.callTool({ name: tool, arguments: JSON.parse(rawArgs) })) as {
  content: Array<{ text: string }>;
  isError?: boolean;
};
console.log(result.content.map((item) => item.text).join("\n"));
await client.close();
await transport.close();
if (result.isError) process.exitCode = 1;
