import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKey } from "../../../packages/core/src/keys.ts";
import { buildManifest } from "../../../packages/core/src/manifest.ts";
import { buildStatement, signStatement } from "../../../packages/core/src/signature.ts";
import { SIGNATURE_FILE } from "../../../packages/core/src/types.ts";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import { loadInstalled, readProtection, saveInstalled, stateDir } from "../src/state.ts";
import { type AuditDeps, auditInstalled, renderAudit } from "../src/tools/audit.ts";

const dirs: string[] = [];
const previousState = process.env.SKILLMARK_STATE_DIR;
const previousHome = process.env.HERMES_HOME;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-audit-test-"));
  dirs.push(dir);
  process.env.SKILLMARK_STATE_DIR = dir;
  process.env.HERMES_HOME = dir;
});
afterEach(() => {
  if (previousState === undefined) delete process.env.SKILLMARK_STATE_DIR;
  else process.env.SKILLMARK_STATE_DIR = previousState;
  if (previousHome === undefined) delete process.env.HERMES_HOME;
  else process.env.HERMES_HOME = previousHome;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function seedSkill() {
  const stage = join(stateDir(), "staging", "invoice-parser");
  mkdirSync(stage, { recursive: true });
  writeFileSync(
    join(stage, "SKILL.md"),
    "---\nname: invoice-parser\ndescription: Parse invoices.\nversion: 1.0.0\n---\n# Parser\n",
  );
  const key = generateKey("audit-test");
  const { manifestHash } = await buildManifest(stage);
  const statement = buildStatement({ manifestHash, name: "invoice-parser", version: "1.0.0", key });
  writeFileSync(join(stage, SIGNATURE_FILE), JSON.stringify(signStatement(statement, key)));
  saveInstalled([
    {
      name: "invoice-parser",
      version: "1.0.0",
      manifestHash: "sha256:" + "ab".repeat(32),
      owner: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
      installedAt: new Date().toISOString(),
      stagePath: stage,
    },
  ]);
}

const active: RegistryReader = {
  ownerOfKeyOnChain: async () => ({
    found: true,
    ownerAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "Active",
  }),
  ownerOfKeyMcp: async () => ({
    owner: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "Active",
  }),
  checkBadge: async () => ({ agents: [] }),
};
const revoked: RegistryReader = {
  ...active,
  ownerOfKeyOnChain: async () => ({
    found: true,
    ownerAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "Revoked",
  }),
};

function deps(reader: RegistryReader): AuditDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    reader,
    calls,
    uninstall: async (name) => {
      calls.push(`uninstall:${name}`);
      return { code: 0, stdout: `Uninstalled '${name}'`, stderr: "" };
    },
    list: async () => {
      calls.push("list");
      return { code: 0, stdout: "Installed Skills", stderr: "" };
    },
  };
}

describe("audit_installed", () => {
  it("keeps a still-verified skill installed", async () => {
    await seedSkill();
    const d = deps(active);
    const report = await auditInstalled(d);
    expect(report.healthy).toEqual(["invoice-parser"]);
    expect(report.quarantined).toEqual([]);
    expect(d.calls).toEqual([]);
    expect(loadInstalled()).toHaveLength(1);
  });

  it("quarantines a revoked skill without deleting it and removes it from state", async () => {
    await seedSkill();
    const d = deps(revoked);
    const report = await auditInstalled(d);
    expect(report.quarantined).toEqual(["invoice-parser"]);
    expect(d.calls).toEqual(["uninstall:invoice-parser", "list"]);
    expect(loadInstalled()).toEqual([]);
    const quarantine = join(process.env.HERMES_HOME ?? "", "skillmark-quarantine");
    expect(existsSync(quarantine)).toBe(true);
    expect((await import("node:fs")).readdirSync(quarantine)).toHaveLength(1);
  });

  it("keeps skills installed when the chain is temporarily unreachable", async () => {
    await seedSkill();
    const unavailable: RegistryReader = {
      ...active,
      ownerOfKeyOnChain: async () => {
        throw new Error("connection refused");
      },
    };
    const d = deps(unavailable);
    const report = await auditInstalled(d);
    expect(report.uncertain).toEqual(["invoice-parser"]);
    expect(report.quarantined).toEqual([]);
    expect(d.calls).toEqual([]);
    expect(loadInstalled()).toHaveLength(1);
    expect(renderAudit(report)).toContain("kept installed until the next audit");
    expect(readProtection().lastReport?.uncertain).toBe(1);
  });

  it("renders a readable summary", () => {
    expect(
      renderAudit({
        checked: ["a"],
        quarantined: ["a"],
        healthy: [],
        missing: [],
        uncertain: [],
        checkedAt: "2026-11-26T00:00:00Z",
      }),
    ).toContain("QUARANTINED");
    expect(
      renderAudit({
        checked: ["b"],
        quarantined: [],
        healthy: ["b"],
        missing: [],
        uncertain: [],
        checkedAt: "2026-11-26T00:00:00Z",
      }),
    ).toContain("all VERIFIED");
  });
});
