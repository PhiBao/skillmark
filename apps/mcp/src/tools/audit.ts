import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type RegistryReader,
  type Verification,
  verifySkill,
} from "../../../../packages/core/src/verifier.ts";
import { hermesList, hermesUninstall } from "../hermes.ts";
import { type InstalledEntry, loadInstalled, removeInstalled, stateDir } from "../state.ts";
import type { McpConfig } from "./verify.ts";

export interface AuditDeps {
  reader: RegistryReader;
  uninstall?: (name: string) => Promise<{ code: number; stdout: string; stderr: string }>;
  list?: () => Promise<{ code: number; stdout: string; stderr: string }>;
  now?: () => string;
}

export interface AuditReport {
  checked: string[];
  quarantined: string[];
  healthy: string[];
  missing: string[];
}

function quarantineDir(): string {
  return join(process.env.HERMES_HOME ?? join(homedir(), ".hermes"), "skillmark-quarantine");
}

/** Re-verify every installed skill; quarantine anything that is no longer `verified`. */
export async function auditInstalled(
  deps: AuditDeps,
  config: McpConfig = { indexUrl: process.env.SKILLMARK_INDEX_URL ?? "http://127.0.0.1:8080" },
): Promise<AuditReport> {
  void config;
  const report: AuditReport = { checked: [], quarantined: [], healthy: [], missing: [] };
  const uninstall = deps.uninstall ?? hermesUninstall;
  const list = deps.list ?? hermesList;
  const stamp = deps.now?.() ?? new Date().toISOString();

  for (const entry of loadInstalled()) {
    report.checked.push(entry.name);
    const verification = await reverify(entry, deps.reader);
    if (verification?.result === "verified") {
      report.healthy.push(entry.name);
      continue;
    }
    await quarantine(entry, stamp, uninstall, list);
    report.quarantined.push(entry.name);
  }
  return report;
}

async function reverify(
  entry: InstalledEntry,
  reader: RegistryReader,
): Promise<Verification | undefined> {
  if (!existsSync(join(entry.stagePath, "SKILL.md"))) return undefined;
  try {
    return await verifySkill(entry.stagePath, { registryReader: reader });
  } catch {
    return undefined;
  }
}

async function quarantine(
  entry: InstalledEntry,
  stamp: string,
  uninstall: NonNullable<AuditDeps["uninstall"]>,
  list: NonNullable<AuditDeps["list"]>,
): Promise<void> {
  const destination = join(quarantineDir(), `${entry.name}-${stamp.replace(/[:.]/g, "-")}`);
  mkdirSync(quarantineDir(), { recursive: true });
  if (existsSync(entry.stagePath)) cpSync(entry.stagePath, destination, { recursive: true });
  await uninstall(entry.name);
  removeInstalled(entry.name);
  await list();
}

export function renderAudit(report: AuditReport): string {
  const lines: string[] = [];
  if (report.quarantined.length === 0) {
    lines.push(`✓ ${report.checked.length} installed skill(s) re-verified — all VERIFIED`);
  } else {
    for (const name of report.quarantined) {
      lines.push(`✕ ${name} — QUARANTINED (no longer verified; moved to skillmark-quarantine)`);
    }
    for (const name of report.healthy) lines.push(`✓ ${name} — still VERIFIED`);
  }
  for (const name of report.missing) lines.push(`✕ ${name} — files missing; quarantined`);
  return lines.join("\n");
}
