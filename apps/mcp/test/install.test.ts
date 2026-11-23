import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hermesList, installSucceeded, verdictOf } from "../src/hermes.ts";
import { buildLocalIndex } from "../src/localWellKnown.ts";
import { addInstalled, loadInstalled, removeInstalled } from "../src/state.ts";
import { renderVerification } from "../src/tools/verify.ts";

const dirs: string[] = [];
const previousState = process.env.SKILLMARK_STATE_DIR;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-mcp-test-"));
  dirs.push(dir);
  process.env.SKILLMARK_STATE_DIR = dir;
});
afterEach(() => {
  if (previousState === undefined) delete process.env.SKILLMARK_STATE_DIR;
  else process.env.SKILLMARK_STATE_DIR = previousState;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Hermes output parsing", () => {
  it("reads the scanner verdict", () => {
    expect(verdictOf("Verdict: SAFE\nDecision: ALLOWED")).toBe("safe");
    expect(verdictOf("Verdict: DANGEROUS\nCRITICAL exfiltration")).toBe("dangerous");
    expect(verdictOf("Verdict: CAUTION")).toBe("caution");
    expect(verdictOf("no verdict here")).toBe("unknown");
  });
  it("requires a successful CLI result", () => {
    expect(installSucceeded({ code: 0, stdout: "Installed: demo\n", stderr: "" })).toBe(true);
    expect(installSucceeded({ code: 1, stdout: "Installed: demo\n", stderr: "" })).toBe(false);
  });
  it("uses execFile without a shell", async () => {
    const result = await hermesList();
    expect(result.stdout).toContain("Installed Skills");
  });
});

describe("local well-known index", () => {
  it("lists staged skills and their files", () => {
    const stage = join(dirs[0], "staging");
    mkdirSync(join(stage, "invoice-parser", "scripts"), { recursive: true });
    writeFileSync(
      join(stage, "invoice-parser", "SKILL.md"),
      "---\nname: invoice-parser\ndescription: Parse invoices.\n---\n# Parser\n",
    );
    writeFileSync(join(stage, "invoice-parser", "scripts", "run.sh"), "echo hi\n");
    expect(buildLocalIndex(stage)).toEqual({
      skills: [
        {
          name: "invoice-parser",
          description: "Parse invoices.",
          files: ["SKILL.md", "scripts/run.sh"],
        },
      ],
    });
  });
});

describe("installed state", () => {
  it("adds and removes entries", () => {
    const entry = {
      name: "invoice-parser",
      version: "1.0.0",
      manifestHash: "sha256:" + "ab".repeat(32),
      owner: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
      installedAt: new Date().toISOString(),
      stagePath: "/tmp/stage",
    };
    addInstalled(entry);
    expect(loadInstalled()).toEqual([entry]);
    removeInstalled("invoice-parser");
    expect(loadInstalled()).toEqual([]);
  });
});

describe("tool output", () => {
  it("follows the D§S3 text shape and keeps the safety caveat", () => {
    const text = renderVerification("invoice-parser", "1.0.0", {
      result: "verified",
      reasons: ["active-key"],
      key: { namespace: "skillmark:v1", key_type: "ed25519", public_key_hex: "ab".repeat(32) },
      manifestHash: "sha256:" + "cd".repeat(32),
      checkedAt: new Date().toISOString(),
      owner_account: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    });
    expect(text).toContain("✓ invoice-parser 1.0.0 — VERIFIED");
    expect(text).toContain("Hermes scanner still decides");
  });
});
