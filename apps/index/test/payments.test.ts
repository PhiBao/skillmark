import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { bundlePath } from "../src/bundles.ts";
import { createApp } from "../src/server.ts";
import { type ListingRow, openStore } from "../src/store.ts";

const dirs: string[] = [];
const servers: Array<{ close: () => void }> = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SPONSOR = "3uR2Rp5oPsCJy7Btf3rXUNxujRiz6dJhdfp1k3hMPNr3GHTcWB";
const PAYEE = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";
const bytes = Buffer.from("paid bundle bytes");
const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function listen<T extends { listen: (...args: any[]) => any }>(target: T): Promise<string> {
  const listener = target.listen(0, "127.0.0.1");
  servers.push(listener);
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  return `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
}

function facilitatorStub() {
  const app = express();
  app.use(express.json());
  app.get("/facilitator/supported", (_req, res) => {
    res.json({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
          extra: { feePayer: SPONSOR },
        },
      ],
      extensions: [],
      signers: { "ccd:*": [SPONSOR] },
    });
  });
  app.post("/facilitator/verify", (_req, res) => res.json({ isValid: true, payer: PAYEE }));
  app.post("/facilitator/settle", (_req, res) =>
    res.json({
      success: true,
      transaction: "ab".repeat(32),
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    }),
  );
  return app;
}

function paidListing(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    name: "paid-skill",
    version: "1.0.0",
    description: "Paid skill.",
    manifestHash: `sha256:${"ab".repeat(32)}`,
    sig: "{}",
    bundleSha256: digest,
    sizeBytes: bytes.length,
    price: JSON.stringify({ amountMicroCcd: "500000", asset: "CCD" }),
    payTo: PAYEE,
    publisherAccount: PAYEE,
    status: "verified",
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function setup(row: ListingRow, withBundle = true) {
  const dataDir = mkdtempSync(join(tmpdir(), "skillmark-pay-"));
  dirs.push(dataDir);
  if (withBundle) {
    mkdirSync(join(dataDir, "bundles"), { recursive: true });
    writeFileSync(bundlePath(dataDir, row), bytes);
  }
  const store = openStore(dataDir);
  store.insertListing(row);
  const facilitatorUrl = `${await listen(facilitatorStub())}/facilitator`;
  const app = createApp({ store, dataDir, facilitatorUrl });
  return { store, base: await listen(app) };
}

describe("x402 paid bundles", () => {
  it("returns 402 with payTo, amount and extra.manifestHash", async () => {
    const row = paidListing();
    const { base } = await setup(row);
    const response = await fetch(`${base}/skills/${row.name}/${row.version}/bundle.tgz`);
    expect(response.status).toBe(402);
    const header = response.headers.get("payment-required");
    expect(header).toBeTruthy();
    const required = decodePaymentRequiredHeader(String(header)) as any;
    expect(required.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
      payTo: PAYEE,
      amount: "500000",
      asset: "CCD",
      extra: { manifestHash: row.manifestHash },
    });
  });

  it("leaves free bundles to the plain route", async () => {
    const row = paidListing({ name: "free-skill", price: null, payTo: null });
    const { base } = await setup(row);
    const response = await fetch(`${base}/skills/free-skill/1.0.0/bundle.tgz`);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("refuses a non-verified listing before payment", async () => {
    const row = paidListing({ status: "pending" });
    const { base } = await setup(row);
    expect((await fetch(`${base}/skills/${row.name}/${row.version}/bundle.tgz`)).status).toBe(403);
  });
});
