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

function storeWithListing(): Store {
  const dataDir = mkdtempSync(join(tmpdir(), "skillmark-failure-"));
  dirs.push(dataDir);
  const store = openStore(dataDir);
  const row: ListingRow = {
    name: "invoice-parser",
    version: "1.0.0",
    description: "Parse invoices.",
    manifestHash: `sha256:${"cd".repeat(32)}`,
    sig: JSON.stringify({ statement: { key } }),
    bundleSha256: `sha256:${"ef".repeat(32)}`,
    sizeBytes: 1,
    price: null,
    payTo: null,
    publisherAccount: OWNER,
    status: "verified",
    publishedAt: new Date().toISOString(),
  };
  store.insertListing(row);
  return store;
}

const reader = (overrides: Partial<RegistryReader>): RegistryReader => ({
  ownerOfKeyOnChain: async () => ({ found: true, ownerAccount: OWNER, status: "Active" }),
  ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Active" }),
  checkBadge: async () => ({ agents: [] }),
  ...overrides,
});

describe("provenance never claims verified when it cannot prove it", () => {
  it("chain unreachable", async () => {
    const result = await provenance("invoice-parser", "1.0.0", {
      store: storeWithListing(),
      reader: reader({
        ownerOfKeyOnChain: async () => {
          throw new Error("unreachable");
        },
      }),
    });
    expect(result?.status).toBe("unreachable");
    expect(result?.lines.find((line) => line.label === "Key status")?.check).toBe("unknown");
  });

  it("registry mismatch", async () => {
    const result = await provenance("invoice-parser", "1.0.0", {
      store: storeWithListing(),
      reader: reader({ ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Revoked" }) }),
    });
    expect(result?.status).toBe("registry-mismatch");
  });

  it("revoked", async () => {
    const result = await provenance("invoice-parser", "1.0.0", {
      store: storeWithListing(),
      reader: reader({
        ownerOfKeyOnChain: async () => ({ found: true, ownerAccount: OWNER, status: "Revoked" }),
        ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Revoked" }),
      }),
    });
    expect(result?.status).toBe("revoked");
  });
});
