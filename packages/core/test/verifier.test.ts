import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, MAINNET_CAIP2 } from "../src/config.js";
import { generateKey } from "../src/keys.js";
import { buildManifest } from "../src/manifest.js";
import { buildStatement, signStatement } from "../src/signature.js";
import { type OwnerOfKeyView, type RegistryReader, verifySkill } from "../src/verifier.js";

const dirs: string[] = [];
function skillDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-verifier-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "SKILL.md"),
    "---\nname: invoice-parser\ndescription: Parse invoices.\nversion: 1.0.0\n---\n# Invoice Parser\n",
  );
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const config = loadConfig();
const ALICE = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";

async function signedSkill(
  dir: string,
  overrides: Partial<{ network: string; cis8Index: number }> = {},
) {
  const key = generateKey("verifier");
  const { manifestHash } = await buildManifest(dir);
  const statement = buildStatement(
    {
      manifestHash,
      name: "invoice-parser",
      version: "1.0.0",
      key,
      network: overrides.network,
      cis8: overrides.cis8Index ? { index: overrides.cis8Index, subindex: 0 } : undefined,
    },
    config,
  );
  const sig = signStatement(statement, key);
  writeFileSync(join(dir, "skillmark.sig.json"), JSON.stringify(sig));
  return { key, sig };
}

const active: OwnerOfKeyView = {
  found: true,
  ownerAccount: ALICE,
  status: "Active",
  lastUpdated: "2026-11-23T07:18:52.623Z",
};
const reader = (view: OwnerOfKeyView, mcpOwner = ALICE, mcpStatus = "Active"): RegistryReader => ({
  ownerOfKeyOnChain: async () => view,
  ownerOfKeyMcp: async () => ({ owner: mcpOwner, status: mcpStatus }),
  checkBadge: async () => ({ agents: [{ token_address: "JyP9X27NaWPtZcxP3kqNX" }] }),
});

describe("verifier decision table", () => {
  it("row 1: unsigned", async () => {
    const result = await verifySkill(skillDir(), { registryReader: reader(active), config });
    expect(result.result).toBe("unsigned");
  });

  it("row 2: invalid manifest (symlink)", async () => {
    const dir = skillDir();
    await signedSkill(dir);
    symlinkSync("/etc/passwd", join(dir, "leak.txt"));
    const result = await verifySkill(dir, { registryReader: reader(active), config });
    expect(result.result).toBe("invalid");
  });

  it("row 3: tampered contents", async () => {
    const dir = skillDir();
    await signedSkill(dir);
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: invoice-parser\ndescription: Changed.\nversion: 1.0.0\n---\n# Changed\n",
    );
    const result = await verifySkill(dir, { registryReader: reader(active), config });
    expect(result.result).toBe("tampered");
    expect(result.reasons).toContain("manifest-mismatch");
  });

  it("row 4: bad signature", async () => {
    const dir = skillDir();
    const { sig } = await signedSkill(dir);
    writeFileSync(
      join(dir, "skillmark.sig.json"),
      JSON.stringify({ ...sig, signature_hex: "00".repeat(64) }),
    );
    const result = await verifySkill(dir, { registryReader: reader(active), config });
    expect(result.result).toBe("tampered");
    expect(result.reasons).toContain("invalid-signature");
  });

  it("row 5: wrong registry", async () => {
    const dir = skillDir();
    await signedSkill(dir, { network: MAINNET_CAIP2 });
    const result = await verifySkill(dir, { registryReader: reader(active), config });
    expect(result.result).toBe("wrong-registry");
  });

  it("row 6: revoked on chain", async () => {
    const dir = skillDir();
    const { key } = await signedSkill(dir);
    const result = await verifySkill(dir, {
      registryReader: reader({ ...active, status: "Revoked" }),
      config,
    });
    expect(result.result).toBe("revoked");
    expect(result.key.public_key_hex).toBe(key.public_key_hex);
  });

  it("row 7: absent key with a prior verified record", async () => {
    const dir = skillDir();
    const { key } = await signedSkill(dir);
    const result = await verifySkill(dir, {
      registryReader: reader({ found: false, ownerAccount: null, status: null }),
      priorRecords: [
        {
          key: {
            namespace: "skillmark:v1",
            key_type: "ed25519",
            public_key_hex: key.public_key_hex,
          },
          result: "verified",
        },
      ],
      config,
    });
    expect(result.result).toBe("revoked");
  });

  it("row 8: absent key, no prior record", async () => {
    const dir = skillDir();
    await signedSkill(dir);
    const result = await verifySkill(dir, {
      registryReader: reader({ found: false, ownerAccount: null, status: null }),
      config,
    });
    expect(result.result).toBe("unknown-key");
  });

  it("row 9: chain and MCP disagree — fail closed", async () => {
    const dir = skillDir();
    await signedSkill(dir);
    const result = await verifySkill(dir, {
      registryReader: reader(active, "3uR2Rp5oPsCJy7Btf3rXUNxujRiz6dJhdfp1k3hMPNr3GHTcWB"),
      config,
    });
    expect(result.result).toBe("registry-mismatch");
    const statusMismatch = await verifySkill(dir, {
      registryReader: reader(active, ALICE, "Revoked"),
      config,
    });
    expect(statusMismatch.result).toBe("registry-mismatch");
  });

  it("row 10: verified with owner, timestamp and badges", async () => {
    const dir = skillDir();
    await signedSkill(dir);
    const result = await verifySkill(dir, { registryReader: reader(active), config });
    expect(result.result).toBe("verified");
    expect(result.owner_account).toBe(ALICE);
    expect(result.last_updated).toBe(active.lastUpdated);
    expect(result.badges).toEqual(["JyP9X27NaWPtZcxP3kqNX"]);
  });

  it("never verifies when the chain is unreachable", async () => {
    const dir = skillDir();
    await signedSkill(dir);
    const broken: RegistryReader = {
      ownerOfKeyOnChain: async () => {
        throw new Error("connection refused");
      },
      ownerOfKeyMcp: async () => null,
      checkBadge: async () => [],
    };
    const result = await verifySkill(dir, { registryReader: broken, config });
    expect(result.result).toBe("unknown-key");
    expect(result.reasons.some((reason) => reason.startsWith("chain-unreachable"))).toBe(true);
  });

  it("fails closed if the MCP read throws", async () => {
    const dir = skillDir();
    await signedSkill(dir);
    const broken: RegistryReader = {
      ownerOfKeyOnChain: async () => active,
      ownerOfKeyMcp: async () => {
        throw new Error("mcp down");
      },
      checkBadge: async () => [],
    };
    expect((await verifySkill(dir, { registryReader: broken, config })).result).toBe(
      "registry-mismatch",
    );
  });
});
