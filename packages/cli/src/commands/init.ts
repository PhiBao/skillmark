import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface InitOptions {
  indexUrl?: string;
  dryRun: boolean;
  writeHermesConfig: boolean;
}

export interface SkillmarkConfig {
  indexUrl: string;
  stateDir: string;
  keysDir: string;
  walletFile: string;
  signingKeyFile: string;
}

export function defaultConfig(indexUrl?: string): SkillmarkConfig {
  return {
    indexUrl: indexUrl ?? process.env.SKILLMARK_INDEX_URL ?? "https://skillmark-index.onrender.com",
    stateDir: process.env.SKILLMARK_STATE_DIR ?? join(homedir(), ".hermes", "skillmark"),
    keysDir: process.env.SKILLMARK_KEYS_DIR ?? join(homedir(), ".skillmark", "keys"),
    walletFile:
      process.env.HERMES_WALLET_FILE ?? join(homedir(), ".skillmark", "wallets", "hermes.export"),
    signingKeyFile:
      process.env.HERMES_SIGNING_KEY_FILE ?? join(homedir(), ".skillmark", "keys", "hermes.json"),
  };
}

export function configPath(): string {
  return join(homedir(), ".skillmark", "config.json");
}

export function mcpBlock(config: SkillmarkConfig): string {
  return [
    "mcp_servers:",
    "  skillmark:",
    "    command: skillmark-mcp",
    "    env:",
    `      SKILLMARK_INDEX_URL: ${config.indexUrl}`,
    `      SKILLMARK_STATE_DIR: ${config.stateDir}`,
    `      HERMES_WALLET_FILE: ${config.walletFile}`,
    `      HERMES_SIGNING_KEY_FILE: ${config.signingKeyFile}`,
  ].join("\n");
}

export async function init(options: InitOptions): Promise<void> {
  const config = defaultConfig(options.indexUrl);
  console.log("Skillmark configuration\n");
  console.log(JSON.stringify(config, null, 2));
  console.log("\nAdd this to your Hermes config.yaml:\n");
  console.log(mcpBlock(config));

  if (options.dryRun) {
    console.log("\n(dry run — nothing written)");
    return;
  }

  const file = configPath();
  mkdirSync(join(homedir(), ".skillmark"), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  mkdirSync(config.stateDir, { recursive: true });
  console.log(`\nwrote ${file} (0600) and created ${config.stateDir}`);

  if (options.writeHermesConfig) {
    if (!existsSync(join(homedir(), ".hermes", "config.yaml"))) {
      console.log("Hermes config not found; merge the block above by hand.");
      return;
    }
    try {
      execFileSync(
        process.env.HERMES_BIN ?? "hermes",
        [
          "mcp",
          "add",
          "skillmark",
          "--command",
          "skillmark-mcp",
          "--env",
          `SKILLMARK_INDEX_URL=${config.indexUrl}`,
          `SKILLMARK_STATE_DIR=${config.stateDir}`,
          `HERMES_WALLET_FILE=${config.walletFile}`,
          `HERMES_SIGNING_KEY_FILE=${config.signingKeyFile}`,
        ],
        { stdio: "inherit" },
      );
      console.log("Hermes config updated.");
    } catch (error) {
      console.log(
        `Could not run 'hermes mcp add' (${(error as Error).message}). Merge the block above by hand.`,
      );
    }
  }
}
