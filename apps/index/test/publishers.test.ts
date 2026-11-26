import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import type { publisherRecord } from "../src/publishers.ts";
import { createApp } from "../src/server.ts";
import { openStore, type Store } from "../src/store.ts";

const dirs: string[] = [];
const servers: Array<{ close: () => void }> = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const OWNER = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";
const KEY = "ab".repeat(32);
const ROTATED_KEY = "bc".repeat(32);
const reader: RegistryReader = {
  ownerOfKeyOnChain: async () => ({ found: true, ownerAccount: OWNER, status: "Active" }),
  ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Active" }),
  checkBadge: async () => ({ agents: [] }),
};
type PublisherResponse = Awaited<ReturnType<typeof publisherRecord>>;
type HistoryResponse = { events: ReturnType<Store["listingHistory"]> };

async function setup(activeReader: RegistryReader = reader, rotateKey = false) {
  const dataDir = mkdtempSync(join(tmpdir(), "skillmark-publisher-"));
  dirs.push(dataDir);
  const store = openStore(dataDir);
  for (const manifestHash of ["cd".repeat(32), "ef".repeat(32)]) {
    const keyHex = rotateKey && manifestHash.startsWith("ef") ? ROTATED_KEY : KEY;
    store.insertListing({
      name: "invoice-parser",
      version: "1.0.0",
      description: "Parse invoices.",
      manifestHash: `sha256:${manifestHash}`,
      sig: JSON.stringify({
        statement: {
          key: { namespace: "skillmark:v1", key_type: "ed25519", public_key_hex: keyHex },
        },
      }),
      bundleSha256: `sha256:${manifestHash}`,
      sizeBytes: 10,
      price: null,
      payTo: null,
      publisherAccount: OWNER,
      status: "verified",
      publishedAt: manifestHash.startsWith("cd") ? "2026-11-23T10:00:00Z" : "2026-11-24T10:00:00Z",
    });
  }
  const settlement = {
    name: "invoice-parser",
    version: "1.0.0",
    txHash: "12".repeat(32),
    payer: "3mhv",
    amountMicroCcd: "250000",
  };
  store.addSettlement(settlement);
  store.addSettlement(settlement);
  const listener = createApp({ store, dataDir, registryReader: activeReader }).listen(
    0,
    "127.0.0.1",
  );
  servers.push(listener);
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  return `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
}

describe("publisher trust record", () => {
  it("shows observed key state, release history and deduplicated settlement links", async () => {
    const base = await setup();
    const result = (await (
      await fetch(`${base}/api/publishers/${OWNER}`)
    ).json()) as PublisherResponse;
    expect(result.status).toBe("verified");
    expect(result.scope).toContain("not a complete account history");
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].status).toBe("Active");
    expect(result.history).toHaveLength(2);
    expect(result.settlementCounts[0].count).toBe(1);
    expect(result.settlementTotal).toBe(1);
    expect(result.settlements[0].link).toContain("ccdexplorer.io/testnet/transaction/");
    const history = (await (
      await fetch(`${base}/api/skills/invoice-parser/history`)
    ).json()) as HistoryResponse;
    expect(history.events).toHaveLength(2);
  });

  it("retains old observed keys after a signing-key rotation", async () => {
    const base = await setup(reader, true);
    const result = (await (
      await fetch(`${base}/api/publishers/${OWNER}`)
    ).json()) as PublisherResponse;
    expect(result.keys.map((key) => key.public_key_hex).sort()).toEqual([KEY, ROTATED_KEY].sort());
    expect(result.history.map((event) => event.keyHex).sort()).toEqual([KEY, ROTATED_KEY].sort());
  });

  it("does not claim verified when the publisher key is revoked", async () => {
    const revoked: RegistryReader = {
      ...reader,
      ownerOfKeyOnChain: async () => ({ found: true, ownerAccount: OWNER, status: "Revoked" }),
      ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Revoked" }),
    };
    const base = await setup(revoked);
    const result = (await (
      await fetch(`${base}/api/publishers/${OWNER}`)
    ).json()) as PublisherResponse;
    expect(result.status).toBe("revoked");
    expect(result.keys[0].status).toBe("Revoked");
  });

  it("fails closed when chain state cannot be read", async () => {
    const unavailable: RegistryReader = {
      ...reader,
      ownerOfKeyOnChain: async () => {
        throw new Error("connection refused");
      },
    };
    const base = await setup(unavailable);
    const result = (await (
      await fetch(`${base}/api/publishers/${OWNER}`)
    ).json()) as PublisherResponse;
    expect(result.status).toBe("unreachable");
    expect(result.keys[0].status).toBe("unreachable");
  });

  it("does not call an unknown account verified", async () => {
    const base = await setup();
    const result = (await (
      await fetch(`${base}/api/publishers/3mhvJTdCv9kDu1qdGoCc8MxXEZuWdRvNJJZfXaiFTHbQCRGe1K`)
    ).json()) as PublisherResponse;
    expect(result.status).toBe("unknown-key");
    expect(result.keys).toEqual([]);
    expect(result.settlementTotal).toBe(0);
  });
});
