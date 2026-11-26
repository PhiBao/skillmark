/**
 * Refresh the complete signed demo catalogue on every boot. Listings are written only
 * after the same verifier used by the product checks them; a revoked key never becomes
 * a VERIFIED seed. Historical settlement proof is checked on chain first.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CcdAmount, TransactionHash } from "@concordium/web-sdk";
import { c as pack } from "tar";
import type { Store } from "../apps/index/src/store.ts";
import { getClient } from "../packages/core/src/chain.ts";
import { loadConfig } from "../packages/core/src/config.ts";
import { buildManifest, parseFrontmatter } from "../packages/core/src/manifest.ts";
import { SIGNATURE_FILE } from "../packages/core/src/types.ts";
import { type RegistryReader, verifySkill } from "../packages/core/src/verifier.ts";

interface CatalogueListing {
  path: string;
  publisherAccount: string;
  price: { amountMicroCcd: string; asset: "CCD" } | null;
  payTo: string | null;
  publishedAt: string;
}
interface HistoricalSettlement {
  name: string;
  version: string;
  txHash: string;
  payer: string;
  payTo: string;
  amountMicroCcd: string;
}
interface CatalogueFile {
  listings: CatalogueListing[];
  historicalSettlements: HistoricalSettlement[];
}

export interface SeedReport {
  seeded: Array<{ name: string; version: string; status: string }>;
  settlements: string[];
}

export async function seedIndex(
  store: Store,
  repoRoot: string,
  dataDir: string,
  reader: RegistryReader,
): Promise<SeedReport> {
  const config = loadConfig();
  const catalogue = JSON.parse(
    readFileSync(join(repoRoot, "config", "demo-catalogue.json"), "utf8"),
  ) as CatalogueFile;
  const report: SeedReport = { seeded: [], settlements: [] };
  const bundlesDir = join(dataDir, "bundles");
  mkdirSync(bundlesDir, { recursive: true });

  for (const item of catalogue.listings) {
    const skillDir = join(repoRoot, item.path);
    const { manifest, manifestHash } = await buildManifest(skillDir);
    const sig = JSON.parse(readFileSync(join(skillDir, SIGNATURE_FILE), "utf8"));
    const frontmatter = parseFrontmatter(readFileSync(join(skillDir, "SKILL.md"), "utf8"));
    const verification = await verifySkill(skillDir, { registryReader: reader });

    const tempBundle = join(dataDir, "bundle-seed.tgz");
    await pack({ gzip: true, portable: true, cwd: skillDir, file: tempBundle }, ["./"]);
    const bytes = readFileSync(tempBundle);
    const bundleSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    writeFileSync(join(bundlesDir, `${bundleSha256.slice(7)}.tgz`), bytes);
    rmSync(tempBundle, { force: true });

    // Refresh existing rows too: a restart must never leave a stale VERIFIED status,
    // and signed fixture rotations must replace the previous bundle atomically.
    const publisherMatches =
      verification.result !== "verified" || verification.owner_account === item.publisherAccount;
    const status = publisherMatches ? verification.result : "registry-mismatch";
    store.insertListing({
      name: manifest.name,
      version: manifest.version,
      description: frontmatter.description ?? "",
      manifestHash,
      sig: JSON.stringify(sig),
      bundleSha256,
      sizeBytes: bytes.length,
      price: item.price ? JSON.stringify(item.price) : null,
      payTo: item.payTo,
      publisherAccount: verification.owner_account ?? item.publisherAccount,
      status,
      publishedAt: item.publishedAt,
    });
    report.seeded.push({
      name: manifest.name,
      version: manifest.version,
      status,
    });
  }

  for (const proof of catalogue.historicalSettlements) {
    if (store.settlements(proof.name, proof.version).some((row) => row.txHash === proof.txHash))
      continue;
    if (await settlementMatchesChain(proof, config)) {
      store.addSettlement(proof);
      report.settlements.push(proof.txHash);
    }
  }
  return report;
}

async function settlementMatchesChain(
  proof: HistoricalSettlement,
  config: ReturnType<typeof loadConfig>,
): Promise<boolean> {
  try {
    const status = await getClient(config).getBlockItemStatus(
      TransactionHash.fromHexString(proof.txHash),
    );
    if (status.status !== "finalized" || !("outcome" in status)) return false;
    const summary = status.outcome.summary as {
      transactionType?: string;
      sender?: { address?: string };
      transfer?: { to?: { address?: string }; amount?: { microCcdAmount?: bigint } };
      sponsor?: { sponsor?: { address?: string } };
    };
    const amount = summary.transfer?.amount?.microCcdAmount;
    return (
      summary.transactionType === "transfer" &&
      summary.sender?.address === proof.payer &&
      summary.transfer?.to?.address === proof.payTo &&
      amount !== undefined &&
      CcdAmount.toMicroCcd(
        summary.transfer.amount as Parameters<typeof CcdAmount.toMicroCcd>[0],
      ).toString() === proof.amountMicroCcd &&
      Boolean(summary.sponsor?.sponsor?.address)
    );
  } catch {
    return false;
  }
}
