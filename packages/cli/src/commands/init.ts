import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface InitOptions {
  indexUrl?: string;
  dryRun: boolean;
  writeHermesConfig: boolean;
  withAuditCron: boolean;
}

export interface SkillmarkConfig {
  indexUrl: string;
  stateDir: string;
  keysDir: string;
  walletFile: string;
  signingKeyFile: string;
  hermesHome: string;
  auditIntervalMs: number;
}

function activeHermesHome(): string {
  if (process.env.HERMES_HOME) return process.env.HERMES_HOME;
  const profile = process.env.HERMES_PROFILE;
  return profile ? join(homedir(), ".hermes", "profiles", profile) : join(homedir(), ".hermes");
}

export function defaultConfig(indexUrl?: string): SkillmarkConfig {
  const hermesHome = activeHermesHome();
  return {
    indexUrl: indexUrl ?? process.env.SKILLMARK_INDEX_URL ?? "https://skillmark-index.onrender.com",
    stateDir: process.env.SKILLMARK_STATE_DIR ?? join(hermesHome, "skillmark"),
    keysDir: process.env.SKILLMARK_KEYS_DIR ?? join(homedir(), ".skillmark", "keys"),
    walletFile:
      process.env.HERMES_WALLET_FILE ?? join(homedir(), ".skillmark", "wallets", "hermes.export"),
    signingKeyFile:
      process.env.HERMES_SIGNING_KEY_FILE ?? join(homedir(), ".skillmark", "keys", "hermes.json"),
    hermesHome,
    auditIntervalMs: Number(process.env.SKILLMARK_AUDIT_INTERVAL_MS ?? 60_000),
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
    `      HERMES_HOME: ${config.hermesHome}`,
    `      HERMES_WALLET_FILE: ${config.walletFile}`,
    `      HERMES_SIGNING_KEY_FILE: ${config.signingKeyFile}`,
    `      SKILLMARK_AUDIT_INTERVAL_MS: ${config.auditIntervalMs}`,
  ].join("\n");
}

function runHermes(args: string[], input?: string): boolean {
  const result = spawnSync(process.env.HERMES_BIN ?? "hermes", args, {
    env: { ...process.env, HERMES_HOME: activeHermesHome() },
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 120_000,
  });
  if (result.status !== 0) {
    console.log(
      `Hermes command failed (${args.join(" ")}): ${result.stderr || result.error?.message || result.status}`,
    );
    return false;
  }
  return true;
}

function writeAuditCron(config: SkillmarkConfig): void {
  const scriptDir = join(config.hermesHome, "scripts");
  const script = join(scriptDir, "skillmark-audit.sh");
  mkdirSync(scriptDir, { recursive: true, mode: 0o700 });
  writeFileSync(script, "#!/usr/bin/env bash\nset -euo pipefail\nexec skillmark-mcp audit\n", {
    mode: 0o755,
  });
  chmodSync(script, 0o755);

  const listed =
    spawnSync(process.env.HERMES_BIN ?? "hermes", ["cron", "list"], {
      env: { ...process.env, HERMES_HOME: config.hermesHome },
      encoding: "utf8",
    }).stdout ?? "";
  if (listed.includes("skillmark-hourly-audit")) {
    console.log("Hermes cron skillmark-hourly-audit already exists; left unchanged.");
    return;
  }
  runHermes([
    "cron",
    "create",
    "0 * * * *",
    "--name",
    "skillmark-hourly-audit",
    "--script",
    "skillmark-audit.sh",
    "--no-agent",
    "--deliver",
    "local",
  ]);
  console.log(
    "Hourly audit cron created. It fires only while a Hermes scheduler/gateway is running.",
  );
}

export async function init(options: InitOptions): Promise<void> {
  const config = defaultConfig(options.indexUrl);
  console.log("Skillmark configuration\n");
  console.log(JSON.stringify(config, null, 2));
  console.log(
    "\nFree mode needs no wallet. Paid installs use HERMES_WALLET_FILE only when configured.",
  );
  console.log("\nAdd this to your Hermes config.yaml:\n");
  console.log(mcpBlock(config));
  if (options.withAuditCron) {
    console.log(
      "\nWith --with-audit-cron, Skillmark also enables loopback installs and creates an hourly audit job.",
    );
  }

  if (options.dryRun) {
    console.log("\n(dry run — nothing written)");
    return;
  }

  mkdirSync(join(homedir(), ".skillmark"), { recursive: true, mode: 0o700 });
  const file = configPath();
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  mkdirSync(config.stateDir, { recursive: true });
  console.log(`\nwrote ${file} (0600) and created ${config.stateDir}`);

  if (options.writeHermesConfig || options.withAuditCron) {
    // Hermes creates config.yaml on first write; a fresh profile may not have it yet.
    runHermes(["config", "set", "security.allow_private_urls", "true", "--force"]);
    runHermes(
      [
        "mcp",
        "add",
        "skillmark",
        "--command",
        "skillmark-mcp",
        "--env",
        `SKILLMARK_INDEX_URL=${config.indexUrl}`,
        `SKILLMARK_STATE_DIR=${config.stateDir}`,
        `HERMES_HOME=${config.hermesHome}`,
        `HERMES_WALLET_FILE=${config.walletFile}`,
        `HERMES_SIGNING_KEY_FILE=${config.signingKeyFile}`,
        `SKILLMARK_AUDIT_INTERVAL_MS=${config.auditIntervalMs}`,
      ],
      "y\n",
    );
  }
  if (options.withAuditCron) writeAuditCron(config);
  if (options.writeHermesConfig)
    console.log("Hermes config updated. Restart Hermes or reload MCP.");
}
