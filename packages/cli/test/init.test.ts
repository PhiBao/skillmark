import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: () => process.env.HOME!,
}));

import { defaultConfig, init, mcpBlock } from "../src/commands/init.ts";

const dirs: string[] = [];
const previous = { ...process.env };
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-init-test-"));
  dirs.push(dir);
  process.env.HOME = dir;
  process.env.HERMES_HOME = join(dir, "hermes");
  process.env.HERMES_PROFILE = "buyer-b";
  delete process.env.SKILLMARK_STATE_DIR;
});
afterEach(() => {
  process.env = { ...previous };
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("skillmark init", () => {
  it("uses the active Hermes profile for state and config", () => {
    delete process.env.HERMES_HOME;
    const config = defaultConfig();
    expect(config.hermesHome).toBe(join(process.env.HOME!, ".hermes", "profiles", "buyer-b"));
    expect(config.stateDir).toBe(join(config.hermesHome, "skillmark"));
    expect(mcpBlock(config)).toContain(`HERMES_HOME: ${config.hermesHome}`);
    expect(mcpBlock(config)).toContain("SKILLMARK_AUDIT_INTERVAL_MS: 60000");
  });

  it("writes mode-0600 config and creates an executable audit cron only when requested", async () => {
    const hermesHome = process.env.HERMES_HOME!;
    mkdirSync(hermesHome, { recursive: true });
    // A fresh Hermes profile has no config.yaml; init must let Hermes create it.
    const bin = join(process.env.HOME!, "hermes-bin");
    const log = join(process.env.HOME!, "hermes-calls.log");
    writeFileSync(bin, `#!/usr/bin/env sh\nprintf '%s\\n' "$*" >> "${log}"\nexit 0\n`);
    chmodSync(bin, 0o755);
    process.env.HERMES_BIN = bin;

    await init({ dryRun: false, writeHermesConfig: true, withAuditCron: true });
    const configFile = join(process.env.HOME!, ".skillmark", "config.json");
    expect(existsSync(configFile)).toBe(true);
    expect((await import("node:fs")).statSync(configFile).mode & 0o777).toBe(0o600);
    const script = join(hermesHome, "scripts", "skillmark-audit.sh");
    expect(readFileSync(script, "utf8")).toContain("skillmark-mcp audit");
    const calls = readFileSync(log, "utf8");
    expect(calls).toContain("config set security.allow_private_urls true");
    expect(calls).toContain("mcp add skillmark");
    expect(calls).toContain("cron create 0 * * * *");
  });

  it("dry-run writes nothing", async () => {
    await init({ dryRun: true, writeHermesConfig: false, withAuditCron: false });
    expect(existsSync(join(process.env.HOME!, ".skillmark", "config.json"))).toBe(false);
  });
});
