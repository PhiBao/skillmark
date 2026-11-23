#!/usr/bin/env -S node --experimental-strip-types
/** Skillmark publisher CLI. Uses only node:util parseArgs — no CLI framework. */
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, type NetworkConfig } from "../../core/src/config.ts";
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

const HELP = `Skillmark CLI

Usage:
  skillmark keygen <label>
  skillmark register-key <label>
  skillmark sign <dir> --key <label>
  skillmark publish <dir> --index <url> [--price <ccd>] [--pay-to <addr>]
  skillmark revoke <label>
  skillmark verify <dir|url>
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      key: { type: "string" },
      index: { type: "string" },
      price: { type: "string" },
      "pay-to": { type: "string" },
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
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

await main();
