import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import { clearProvenanceCache, provenance } from "../src/provenance.ts";
import { type ListingRow, openStore, type Store } from "../src/store.ts";

const dirs: string[] = [];
afterEach(() => {
  clearProvenanceCache();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const OWNER = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";
const key = { namespace: "skillmark:v1", key_type: "ed25519", public_key_hex: "ab".repeat(32) };

function setup(): Store {
  const dataDir = mkdtempSync(join(tmpdir(), "skillmark-prov-"));
  dirs.push(dataDir);
  const store = openStore(dataDir);
  const sig = {
    statement: {
      key,
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
      cis8: { index: 12801, subindex: 0 },
    },
  };
  const row: ListingRow = {
    name: "invoice-parser",
    version: "1.0.0",
    description: "Parse invoices.",
    manifestHash: `sha256:${"cd".repeat(32)}`,
    sig: JSON.stringify(sig),
    bundleSha256: `sha256:${"ef".repeat(32)}`,
    sizeBytes: 1234,
    price: null,
    payTo: null,
    publisherAccount: OWNER,
    status: "verified",
    publishedAt: new Date().toISOString(),
  };
  store.insertListing(row);
  return store;
}

const active: RegistryReader = {
  ownerOfKeyOnChain: async () => ({
    found: true,
    ownerAccount: OWNER,
    status: "Active",
    lastUpdated: "2026-11-23T07:00:00.000Z",
  }),
  ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Active" }),
  checkBadge: async () => ({ agents: [{ token_address: "JyP9X5PpNatg3zfjCcn3S" }] }),
};

describe("provenance API", () => {
  it("returns all ledger lines for a verified skill", async () => {
    const store = setup();
    const result = await provenance("invoice-parser", "1.0.0", { store, reader: active });
    expect(result?.status).toBe("verified");
    expect(result?.lines.map((line) => line.label)).toEqual([
      "Contents",
      "Signed by key",
      "Key owner",
      "Key status",
      "Agent badge",
      "Paid installs",
    ]);
    expect(result?.lines[3].value).toContain("Active");
    expect(result?.lines[4].value).toBe("JyP9X5PpNatg3zfjCcn3S");
    expect(result?.key).toEqual(key);
    expect(result?.network).toBe("ccd:4221332d34e1694168c2a0c0b3fd0f27");
    expect(result?.cis8).toEqual({ index: 12801, subindex: 0 });
    expect(result?.publisherAccount).toBe(OWNER);
  });

  it("returns total settlement count with the latest chain links", async () => {
    const store = setup();
    for (let index = 1; index <= 6; index += 1) {
      store.addSettlement({
        name: "invoice-parser",
        version: "1.0.0",
        txHash: index.toString(16).padStart(64, "0"),
        payer: OWNER,
        amountMicroCcd: "250000",
      });
    }
    const result = await provenance("invoice-parser", "1.0.0", { store, reader: active });
    expect(result?.lines.find((line) => line.label === "Paid installs")?.value).toContain(
      "6 total",
    );
    expect(result?.settlementTotal).toBe(6);
    expect(result?.settlements).toHaveLength(5);
    expect(result?.settlements[0].link).toContain("ccdexplorer.io/testnet/transaction/");
  });

  it("shows revoked without a verified state", async () => {
    const store = setup();
    const revoked: RegistryReader = {
      ...active,
      ownerOfKeyOnChain: async () => ({ found: true, ownerAccount: OWNER, status: "Revoked" }),
      ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Revoked" }),
    };
    const result = await provenance("invoice-parser", "1.0.0", { store, reader: revoked });
    expect(result?.status).toBe("revoked");
    expect(result?.lines.find((line) => line.label === "Key status")?.check).toBe("fail");
  });

  it("shows unreachable and never verified when the chain fails", async () => {
    const store = setup();
    const broken: RegistryReader = {
      ...active,
      ownerOfKeyOnChain: async () => {
        throw new Error("connection refused");
      },
    };
    const result = await provenance("invoice-parser", "1.0.0", { store, reader: broken });
    expect(result?.status).toBe("unreachable");
    expect(result?.lines.find((line) => line.label === "Key owner")?.value).toContain(
      "Couldn't reach testnet",
    );
  });

  it("fails closed on an MCP disagreement", async () => {
    const store = setup();
    const mismatch: RegistryReader = {
      ...active,
      ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Revoked" }),
    };
    expect((await provenance("invoice-parser", "1.0.0", { store, reader: mismatch }))?.status).toBe(
      "registry-mismatch",
    );
  });

  it("serves a 30-second cache and then refreshes", async () => {
    const store = setup();
    let now = 1_000_000;
    const deps = { store, reader: active, now: () => now };
    const first = await provenance("invoice-parser", "1.0.0", deps);
    const second = await provenance("invoice-parser", "1.0.0", deps);
    expect(first?.cached).toBe(false);
    expect(second?.cached).toBe(true);
    now += 31_000;
    const refreshed = await provenance("invoice-parser", "1.0.0", deps);
    expect(refreshed?.cached).toBe(false);
  });

  it("returns undefined for an unknown listing", async () => {
    expect(await provenance("nope", "1.0.0", { store: setup(), reader: active })).toBeUndefined();
  });
});
