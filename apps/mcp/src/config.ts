import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SkillmarkConfig {
  indexUrl?: string;
  stateDir?: string;
  keysDir?: string;
  walletFile?: string;
  signingKeyFile?: string;
  hermesHome?: string;
  auditIntervalMs?: number;
}

/**
 * Read `~/.skillmark/config.json` written by `skillmark init`. Environment variables
 * always win, so a Hermes host can override any value in its MCP config block.
 */
export function applyRuntimeConfig(file = join(homedir(), ".skillmark", "config.json")): void {
  if (!existsSync(file)) return;
  const config = JSON.parse(readFileSync(file, "utf8")) as SkillmarkConfig;
  const set = (key: string, value: string | undefined) => {
    if (!process.env[key] && value) process.env[key] = value;
  };
  set("SKILLMARK_INDEX_URL", config.indexUrl);
  set("SKILLMARK_STATE_DIR", config.stateDir);
  set("SKILLMARK_KEYS_DIR", config.keysDir);
  set("HERMES_WALLET_FILE", config.walletFile);
  set("HERMES_SIGNING_KEY_FILE", config.signingKeyFile);
  set("HERMES_HOME", config.hermesHome);
  set("SKILLMARK_AUDIT_INTERVAL_MS", config.auditIntervalMs?.toString());
}
