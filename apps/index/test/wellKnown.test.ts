import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bundlePath } from "../src/bundles.ts";
import { createApp } from "../src/server.ts";
import { type ListingRow, openStore } from "../src/store.ts";

const dirs: string[] = [];
let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "skillmark-index-"));
  dirs.push(dataDir);
  const store = openStore(dataDir);
  const app = createApp({ store, dataDir });
  return { dataDir, store, app };
}

async function listen(app: ReturnType<typeof createApp>): Promise<string> {
  const listener = app.listen(0, "127.0.0.1");
  server = listener;
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  return `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
}

afterEach(() => {
  if (server) server.close();
  server = undefined;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const bundleBytes = Buffer.from("a fake but deterministic tarball");
const digest = `sha256:${createHash("sha256").update(bundleBytes).digest("hex")}`;

function listing(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    name: "invoice-parser",
    version: "1.0.0",
    description: "Parse invoices.",
    manifestHash: `sha256:${"ab".repeat(32)}`,
    sig: "{}",
    bundleSha256: digest,
    sizeBytes: bundleBytes.length,
    price: null,
    payTo: null,
    publisherAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "verified",
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("index well-known and bundles", () => {
  it("serves both discovery paths with a digest equal to the bundle sha256", async () => {
    const { dataDir, store, app } = setup();
    mkdirSync(join(dataDir, "bundles"), { recursive: true });
    const row = listing();
    writeFileSync(bundlePath(dataDir, row), bundleBytes);
    store.insertListing(row);
    const base = await listen(app);

    for (const path of ["/.well-known/skills/index.json", "/.well-known/agent-skills/index.json"]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      const index = (await response.json()) as any;
      expect(index.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
      expect(index.skills).toHaveLength(1);
      expect(index.skills[0]).toMatchObject({
        name: "invoice-parser",
        type: "archive",
        url: "/skills/invoice-parser/1.0.0/bundle.tgz",
        digest,
        files: ["SKILL.md"],
      });
    }

    const bundle = await fetch(`${base}/skills/invoice-parser/1.0.0/bundle.tgz`);
    expect(bundle.status).toBe(200);
    expect(Buffer.from(await bundle.arrayBuffer())).toEqual(bundleBytes);
  });

  it("omits paid and non-verified listings from the public index", async () => {
    const { store, app } = setup();
    store.insertListing(listing());
    store.insertListing(
      listing({
        name: "paid-skill",
        price: JSON.stringify({ amountMicroCcd: "500000", asset: "CCD" }),
        payTo: "3uR2Rp5oPsCJy7Btf3rXUNxujRiz6dJhdfp1k3hMPNr3GHTcWB",
      }),
    );
    store.insertListing(listing({ name: "unverified-skill", status: "pending" }));
    const base = await listen(app);
    const index = (await (await fetch(`${base}/.well-known/skills/index.json`)).json()) as any;
    expect(index.skills.map((skill: any) => skill.name)).toEqual(["invoice-parser"]);

    const api = (await (await fetch(`${base}/api/skills`)).json()) as any[];
    expect(api).toHaveLength(3);
    expect(api.find((row) => row.name === "paid-skill")?.price).toEqual({
      amountMicroCcd: "500000",
      asset: "CCD",
    });
  });

  it("exposes real listings separately from labelled trust-test demos", async () => {
    const { store, app } = setup();
    store.insertListing(listing());
    const base = await listen(app);
    const result = (await (await fetch(`${base}/api/catalogue`)).json()) as any;
    expect(result.listings).toHaveLength(1);
    expect(result.counts).toEqual({ listings: 1, verified: 1, paid: 0 });
    expect(result.trustTests.map((test: any) => test.state)).toEqual([
      "tampered",
      "unsigned",
      "unreachable",
      "dangerous",
    ]);
  });

  it("returns 402 for a paid bundle and 404 for a missing one", async () => {
    const { dataDir, store, app } = setup();
    mkdirSync(join(dataDir, "bundles"), { recursive: true });
    const row = listing({
      name: "paid-skill",
      price: JSON.stringify({ amountMicroCcd: "500000", asset: "CCD" }),
    });
    writeFileSync(bundlePath(dataDir, row), bundleBytes);
    store.insertListing(row);
    const base = await listen(app);
    expect((await fetch(`${base}/skills/paid-skill/1.0.0/bundle.tgz`)).status).toBe(402);
    expect((await fetch(`${base}/skills/missing/1.0.0/bundle.tgz`)).status).toBe(404);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });
});
