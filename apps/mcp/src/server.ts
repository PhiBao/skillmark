import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../../../packages/core/src/config.ts";
import { createRegistryReader } from "../../../packages/core/src/verifier.ts";
import { anchorLog } from "./tools/anchor.ts";
import { auditInstalled, renderAudit } from "./tools/audit.ts";
import { installSkill } from "./tools/install.ts";
import { fetchAndVerify, type McpConfig, renderVerification } from "./tools/verify.ts";

export function createServer(config: McpConfig): McpServer {
  const server = new McpServer({ name: "skillmark", version: "0.1.0" });
  const args = { name: z.string().min(1), version: z.string().optional() };

  server.tool(
    "verify_skill",
    "Verify a Skillmark skill's signature, key and chain status.",
    args,
    async ({ name, version }) => {
      try {
        const fetched = await fetchAndVerify(name, version, config);
        const result = renderVerification(
          name,
          String(fetched.listing.version),
          fetched.verification,
        );
        fetched.cleanup();
        return { content: [{ type: "text" as const, text: result }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `✕ ${name}: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "install_skill",
    "Verify then install a skill through Hermes's own scanner.",
    args,
    async ({ name, version }) => {
      try {
        const text = await installSkill(name, version, config);
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `✕ ${name}: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "anchor_log",
    "Anchor the current Skillmark log root on Concordium testnet.",
    {},
    async () => {
      try {
        const txHash = await anchorLog();
        return {
          content: [
            {
              type: "text" as const,
              text: `✓ Log anchored — tx ${txHash}\n  https://ccdexplorer.io/testnet/transaction/${txHash}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `✕ anchor: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "audit_installed",
    "Re-verify installed skills and quarantine any that are no longer verified.",
    {},
    async () => {
      try {
        const report = await auditInstalled({ reader: createRegistryReader(loadConfig()) }, config);
        return { content: [{ type: "text" as const, text: renderAudit(report) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `✕ audit: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const config: McpConfig = {
    indexUrl: process.env.SKILLMARK_INDEX_URL ?? "http://127.0.0.1:8080",
  };
  const transport = new StdioServerTransport();
  await createServer(config).connect(transport);
}
