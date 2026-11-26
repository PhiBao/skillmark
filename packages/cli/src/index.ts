/** Skillmark publisher CLI. Uses only node:util parseArgs — no CLI framework. */
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, type NetworkConfig } from "../../core/src/config.ts";
import { anchorVerify } from "./commands/anchorVerify.ts";
import { init } from "./commands/init.ts";
import { keygen } from "./commands/keygen.ts";
import { publish } from "./commands/publish.ts";
import { registerKey } from "./commands/registerKey.ts";
import { revoke } from "./commands/revoke.ts";
import { sign } from "./commands/sign.ts";
import { verify } from "./commands/verify.ts";

export interface Ctx {
  config: NetworkConfig;
  keysDir: string;
  indexUrl: string;
  publisherWalletFile: string;
}

export function makeCtx(): Ctx {
  return {
    config: loadConfig(),
    keysDir: process.env.SKILLMARK_KEYS_DIR ?? join(homedir(), ".skillmark", "keys"),
    indexUrl: process.env.SKILLMARK_INDEX_URL ?? "http://127.0.0.1:8080",
    publisherWalletFile:
      process.env.PUBLISHER_WALLET_FILE ?? join(homedir(), ".skillmark", "wallets", "alice.export"),
  };
}

declare const __SKILLMARK_VERSION__: string | undefined;
const VERSION = typeof __SKILLMARK_VERSION__ === "string" ? __SKILLMARK_VERSION__ : "0.1.0";

const HELP = `Skillmark CLI

Usage:
  skillmark keygen <label>
  skillmark register-key <label>
  skillmark sign <dir> --key <label>
  skillmark publish <dir> --index <url> [--price <ccd>] [--pay-to <addr>]
  skillmark revoke <label>
  skillmark verify <dir|url>
  skillmark anchor-verify <txHash> <log.jsonl>
  skillmark init [--index <url>] [--dry-run] [--write-hermes-config] [--with-audit-cron]
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      key: { type: "string" },
      index: { type: "string" },
      price: { type: "string" },
      "pay-to": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "write-hermes-config": { type: "boolean", default: false },
      "with-audit-cron": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const ctx = makeCtx();
  switch (command) {
    case "keygen":
      await keygen(positionals[0], ctx);
      break;
    case "register-key":
      await registerKey(positionals[0], ctx);
      break;
    case "sign":
      await sign(positionals[0], values.key ?? "", ctx);
      break;
    case "publish":
      await publish(
        positionals[0],
        {
          indexUrl: values.index ?? ctx.indexUrl,
          priceCcd: values.price,
          payTo: values["pay-to"],
        },
        ctx,
      );
      break;
    case "revoke":
      await revoke(positionals[0], ctx);
      break;
    case "verify":
      await verify(positionals[0], ctx);
      break;
    case "anchor-verify":
      await anchorVerify(positionals[0], positionals[1], ctx);
      break;
    case "init":
      await init({
        indexUrl: values.index,
        dryRun: values["dry-run"] === true,
        writeHermesConfig: values["write-hermes-config"] === true,
        withAuditCron: values["with-audit-cron"] === true,
      });
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

await main();
