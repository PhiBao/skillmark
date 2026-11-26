import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import { seedIndex } from "../../../scripts/seed-index.ts";
import { openStore } from "../src/store.ts";
import { buildWellKnownIndex } from "../src/wellKnown.ts";

const dirs: string[] = [];
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureRepo(): { root: string; dataDir: string } {
  const root = mkdtempSync(join(tmpdir(), "skillmark-seed-repo-"));
  dirs.push(root);
  cpSync(join(repoRoot, "fixtures"), join(root, "fixtures"), { recursive: true });
  mkdirSync(join(root, "config"));
  writeFileSync(
    join(root, "config", "demo-catalogue.json"),
    JSON.stringify({
      listings: [
        {
          path: "fixtures/skills/invoice-parser",
          publisherAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
          price: null,
          payTo: null,
          publishedAt: "2026-11-23T10:55:08.153Z",
        },
        {
          path: "fixtures/skills/skillmark-setup",
          publisherAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
          price: null,
          payTo: null,
          publishedAt: "2026-11-23T10:55:09.245Z",
        },
        {
          path: "fixtures/skills/hermes-made/meeting-notes",
          publisherAccount: "4Vrg5rkHN7m2STNTgYAqrxHE1jMAhkeZZ3rfifmtattD9PE5dK",
          price: { amountMicroCcd: "250000", asset: "CCD" },
          payTo: "4Vrg5rkHN7m2STNTgYAqrxHE1jMAhkeZZ3rfifmtattD9PE5dK",
          publishedAt: "2026-11-23T10:55:10.245Z",
        },
      ],
      historicalSettlements: [],
    }),
  );
  return { root, dataDir: mkdtempSync(join(tmpdir(), "skillmark-seed-data-")) };
}

const active: RegistryReader = {
  ownerOfKeyOnChain: async () => ({
    found: true,
    ownerAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "Active",
    lastUpdated: "2026-11-23T10:55:08.000Z",
  }),
  ownerOfKeyMcp: async () => ({
    owner: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "Active",
  }),
  checkBadge: async () => ({ agents: [] }),
};

describe("complete cold-start catalogue", () => {
  it("seeds free, setup and paid listings after real signature verification", async () => {
    const { root, dataDir } = fixtureRepo();
    dirs.push(dataDir);
    const store = openStore(dataDir);
    const report = await seedIndex(store, root, dataDir, active);
    expect(report.seeded.map((row) => row.status)).toEqual(["verified", "verified", "verified"]);
    expect(store.listListings()).toHaveLength(3);
    expect(store.getListing("meeting-notes", "1.0.0")?.price).not.toBeNull();
    expect(
      buildWellKnownIndex(store.listListings())
        .skills.map((row) => row.name)
        .sort(),
    ).toEqual(["invoice-parser", "skillmark-setup"]);
  });

  it("never seeds a revoked key as verified", async () => {
    const { root, dataDir } = fixtureRepo();
    dirs.push(dataDir);
    const store = openStore(dataDir);
    const revoked: RegistryReader = {
      ...active,
      ownerOfKeyOnChain: async () => ({
        found: true,
        ownerAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
        status: "Revoked",
      }),
      ownerOfKeyMcp: async () => ({
        owner: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
        status: "Revoked",
      }),
    };
    await seedIndex(store, root, dataDir, revoked);
    expect(store.listListings().every((row) => row.status === "revoked")).toBe(true);
    expect(buildWellKnownIndex(store.listListings()).skills).toEqual([]);
  });

  it("fails closed when chain reads are unavailable", async () => {
    const { root, dataDir } = fixtureRepo();
    dirs.push(dataDir);
    const store = openStore(dataDir);
    const unavailable: RegistryReader = {
      ...active,
      ownerOfKeyOnChain: async () => {
        throw new Error("chain unavailable");
      },
    };
    const report = await seedIndex(store, root, dataDir, unavailable);
    expect(report.seeded.every((row) => row.status === "unknown-key")).toBe(true);
    expect(buildWellKnownIndex(store.listListings()).skills).toEqual([]);
  });
});
