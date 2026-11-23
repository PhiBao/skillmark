/** Seed the ephemeral index with the signed invoice-parser demo fixture at boot. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { c as pack } from "tar";
import type { Store } from "../apps/index/src/store.ts";
import { buildManifest, parseFrontmatter } from "../packages/core/src/manifest.ts";
import { SIGNATURE_FILE } from "../packages/core/src/types.ts";

export async function seedIndex(store: Store, repoRoot: string, dataDir: string): Promise<void> {
  const skillDir = join(repoRoot, "fixtures", "skills", "invoice-parser");
  const { manifest, manifestHash } = await buildManifest(skillDir);
  const sig = JSON.parse(readFileSync(join(skillDir, SIGNATURE_FILE), "utf8"));
  const frontmatter = parseFrontmatter(readFileSync(join(skillDir, "SKILL.md"), "utf8"));

  const bundlesDir = join(dataDir, "bundles");
  mkdirSync(bundlesDir, { recursive: true });
  const tempBundle = join(dataDir, "bundle-seed.tgz");
  await pack({ gzip: true, portable: true, cwd: skillDir, file: tempBundle }, ["./"]);
  const bytes = readFileSync(tempBundle);
  const bundleSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const bundlePath = join(bundlesDir, `${bundleSha256.slice(7)}.tgz`);
  writeFileSync(bundlePath, bytes);
  rmSync(tempBundle, { force: true });

  if (!store.getListing(manifest.name, manifest.version)) {
    store.insertListing({
      name: manifest.name,
      version: manifest.version,
      description: frontmatter.description ?? "Parse invoices.",
      manifestHash,
      sig: JSON.stringify(sig),
      bundleSha256,
      sizeBytes: bytes.length,
      price: null,
      payTo: null,
      publisherAccount: sig.statement?.key?.public_key_hex
        ? "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q"
        : "",
      status: "verified",
      publishedAt: new Date().toISOString(),
    });
  }
  console.log(`seeded ${manifest.name}@${manifest.version} (${bundleSha256})`);
}
