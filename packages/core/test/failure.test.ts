import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { generateKey } from "../src/keys.js";
import { buildManifest } from "../src/manifest.js";
import { buildStatement, signStatement } from "../src/signature.js";
import { type RegistryReader, verifySkill } from "../src/verifier.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const config = loadConfig();
const OWNER = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";

async function signedSkill(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-core-failure-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "SKILL.md"),
    "---\nname: invoice-parser\ndescription: x\nversion: 1.0.0\n---\n# Parser\n",
  );
  const key = generateKey("failure");
  const { manifestHash } = await buildManifest(dir);
  const statement = buildStatement(
    { manifestHash, name: "invoice-parser", version: "1.0.0", key },
    config,
  );
  writeFileSync(join(dir, "skillmark.sig.json"), JSON.stringify(signStatement(statement, key)));
  return dir;
}

const active: RegistryReader = {
  ownerOfKeyOnChain: async () => ({ found: true, ownerAccount: OWNER, status: "Active" }),
  ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Active" }),
  checkBadge: async () => ({ agents: [] }),
};

describe("failure states never verify", () => {
  it("chain unreachable", async () => {
    const dir = await signedSkill();
    const result = await verifySkill(dir, {
      registryReader: {
        ...active,
        ownerOfKeyOnChain: async () => {
          throw new Error("connection refused");
        },
      },
      config,
    });
    expect(result.result).toBe("unknown-key");
    expect(result.reasons[0]).toMatch(/chain-unreachable/);
  });

  it("registry mismatch", async () => {
    const dir = await signedSkill();
    const result = await verifySkill(dir, {
      registryReader: {
        ...active,
        ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Revoked" }),
      },
      config,
    });
    expect(result.result).toBe("registry-mismatch");
  });

  it("revoked", async () => {
    const dir = await signedSkill();
    const result = await verifySkill(dir, {
      registryReader: {
        ...active,
        ownerOfKeyOnChain: async () => ({ found: true, ownerAccount: OWNER, status: "Revoked" }),
        ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Revoked" }),
      },
      config,
    });
    expect(result.result).toBe("revoked");
  });

  it("tampered after signing", async () => {
    const dir = await signedSkill();
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: invoice-parser\ndescription: CHANGED\nversion: 1.0.0\n---\n# Changed\n",
    );
    expect((await verifySkill(dir, { registryReader: active, config })).result).toBe("tampered");
  });
});
