import { loadConfig } from "../../../packages/core/src/config.ts";
import { createRegistryReader, type RegistryReader } from "../../../packages/core/src/verifier.ts";
import { readProtection, writeProtection } from "./state.ts";
import { type AuditReport, auditInstalled } from "./tools/audit.ts";
import type { McpConfig } from "./tools/verify.ts";

export const DEFAULT_AUDIT_INTERVAL_MS = 60_000;

export function auditIntervalFromEnv(value = process.env.SKILLMARK_AUDIT_INTERVAL_MS): number {
  if (value === undefined || value === "") return DEFAULT_AUDIT_INTERVAL_MS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("SKILLMARK_AUDIT_INTERVAL_MS must be a non-negative integer");
  }
  return parsed;
}

/** Run one audit and persist protection status. Errors stay visible and never claim success. */
export async function runProtectedAudit(
  config: McpConfig,
  reader: RegistryReader = createRegistryReader(loadConfig()),
): Promise<AuditReport> {
  try {
    return await auditInstalled({ reader }, config);
  } catch (error) {
    const protection = readProtection();
    writeProtection({
      ...protection,
      lastError: `${new Date().toISOString()} ${(error as Error).message}`,
    });
    throw error;
  }
}

/**
 * Watch installed keys while the MCP host is running. The timer is unref'd so it
 * never keeps a one-shot CLI/test process alive. An interval of 0 disables it.
 */
export function startAuditWatcher(
  config: McpConfig,
  options: { intervalMs?: number; reader?: RegistryReader } = {},
): () => void {
  const intervalMs = options.intervalMs ?? auditIntervalFromEnv();
  const protection = readProtection();
  writeProtection({ ...protection, automatic: intervalMs > 0, intervalMs });
  if (intervalMs === 0) return () => {};

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runProtectedAudit(config, options.reader ?? createRegistryReader(loadConfig()));
    } catch {
      // Last error is persisted by runProtectedAudit; the next tick retries.
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export function renderProtection(): string {
  const state = readProtection();
  const lines = [
    state.automatic
      ? `✓ automatic audit every ${Math.round(state.intervalMs / 1000)}s while Skillmark is running`
      : "⚠ automatic audit is off — run audit_installed manually or enable the hourly Hermes cron",
  ];
  if (state.lastAuditAt) {
    lines.push(`last audit ${state.lastAuditAt}`);
    if (state.lastReport) {
      lines.push(
        `${state.lastReport.checked} checked · ${state.lastReport.healthy} verified · ${state.lastReport.quarantined} quarantined · ${state.lastReport.uncertain} uncertain`,
      );
    }
  }
  if (state.lastError) lines.push(`last error ${state.lastError}`);
  return lines.join("\n");
}
