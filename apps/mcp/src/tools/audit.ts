import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { appendEntry } from "../../../../packages/core/src/log.ts";
import {
  type RegistryReader,
  type Verification,
  verifySkill,
} from "../../../../packages/core/src/verifier.ts";
import { hermesList, hermesUninstall } from "../hermes.ts";
import {
  type InstalledEntry,
  loadInstalled,
  readProtection,
  removeInstalled,
  stateDir,
  writeProtection,
} from "../state.ts";
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
  uncertain: string[];
  checkedAt: string;
}

function quarantineDir(): string {
  return join(process.env.HERMES_HOME ?? join(homedir(), ".hermes"), "skillmark-quarantine");
}

/** Re-verify installed skills. Definite failures quarantine; an outage is uncertain, not revoked. */
export async function auditInstalled(
  deps: AuditDeps,
  config: McpConfig = { indexUrl: process.env.SKILLMARK_INDEX_URL ?? "http://127.0.0.1:8080" },
): Promise<AuditReport> {
  void config;
  const checkedAt = deps.now?.() ?? new Date().toISOString();
  const report: AuditReport = {
    checked: [],
    quarantined: [],
    healthy: [],
    missing: [],
    uncertain: [],
    checkedAt,
  };
  const uninstall = deps.uninstall ?? hermesUninstall;
  const list = deps.list ?? hermesList;

  for (const entry of loadInstalled()) {
    report.checked.push(entry.name);
    const verification = await reverify(entry, deps.reader);
    if (verification?.result === "verified") {
      report.healthy.push(entry.name);
      continue;
    }
    if (!verification) {
      report.missing.push(entry.name);
    } else if (verification.reasons.some((reason) => reason.startsWith("chain-unreachable"))) {
      report.uncertain.push(entry.name);
      continue;
    }
    await quarantine(entry, checkedAt, uninstall, list);
    report.quarantined.push(entry.name);
  }

  const protection = readProtection();
  writeProtection({
    ...protection,
    lastAuditAt: checkedAt,
    lastReport: {
      checked: report.checked.length,
      healthy: report.healthy.length,
      quarantined: report.quarantined.length,
      uncertain: report.uncertain.length,
    },
    lastError: undefined,
  });
  try {
    appendEntry(join(stateDir(), "log.jsonl"), "verify", {
      kind: "audit",
      checkedAt,
      healthy: report.healthy,
      quarantined: report.quarantined,
      uncertain: report.uncertain,
    });
  } catch {
    // Audit decisions must not depend on log availability.
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
  if (report.quarantined.length === 0 && report.uncertain.length === 0) {
    lines.push(`✓ ${report.checked.length} installed skill(s) re-verified — all VERIFIED`);
  } else {
    for (const name of report.quarantined) {
      lines.push(`✕ ${name} — QUARANTINED (no longer verified; moved to skillmark-quarantine)`);
    }
    for (const name of report.healthy) lines.push(`✓ ${name} — still VERIFIED`);
  }
  for (const name of report.uncertain) {
    lines.push(`⚠ ${name} — could not reach the trust root; kept installed until the next audit`);
  }
  for (const name of report.missing) lines.push(`✕ ${name} — files missing; quarantined`);
  return lines.join("\n");
}
