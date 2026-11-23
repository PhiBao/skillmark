import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c as pack } from "tar";
import { hashManifest } from "../../../core/src/canonical.ts";
import { buildManifest, parseFrontmatter } from "../../../core/src/manifest.ts";
import { SIGNATURE_FILE } from "../../../core/src/types.ts";
import type { Ctx } from "../index.ts";
import { walletFor } from "./registerKey.ts";

export interface PublishOptions {
  indexUrl: string;
  priceCcd?: string;
  payTo?: string;
}

export async function publish(dir: string, options: PublishOptions, ctx: Ctx): Promise<void> {
  if (!dir)
    throw new Error(
      "usage: skillmark publish <dir> --index <url> [--price <ccd>] [--pay-to <addr>]",
    );
  const price = options.priceCcd !== undefined ? Number(options.priceCcd) : 0;
  if (!Number.isFinite(price) || price < 0 || price > 1)
    throw new Error("Price must be between 0 and 1 CCD (D7)");

  const { manifest, manifestHash } = await buildManifest(dir);
  const sigPath = join(dir, SIGNATURE_FILE);
  if (!readFileSync(sigPath, "utf8")) throw new Error("Empty signature file");
  const sig = JSON.parse(readFileSync(sigPath, "utf8"));
  if (sig.statement?.manifestHash !== manifestHash)
    throw new Error("Signature does not match current contents; re-run sign");

  const temp = mkdtempSync(join(tmpdir(), "skillmark-publish-"));
  try {
    const bundlePath = join(temp, "bundle.tgz");
    await pack({ gzip: true, cwd: dir, file: bundlePath }, ["./"]);
    const bytes = readFileSync(bundlePath);
    const frontmatter = parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
    const listing = {
      name: manifest.name,
      version: manifest.version,
      description: frontmatter.description ?? "",
      manifestHash: hashManifest(manifest),
      sig,
      bundleSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      sizeBytes: bytes.length,
      price:
        price === 0
          ? null
          : { amountMicroCcd: String(BigInt(Math.round(price * 1e6))), asset: "CCD" },
      payTo: options.payTo ?? null,
      publisherAccount: walletFor("alice", ctx).address,
    };

    const form = new FormData();
    form.set("bundle", new Blob([bytes], { type: "application/gzip" }), "bundle.tgz");
    form.set("listing", JSON.stringify(listing));
    const response = await fetch(`${options.indexUrl.replace(/\/$/, "")}/api/publish`, {
      method: "POST",
      body: form,
    });
    const body = await response.text();
    console.log(body);
    if (!response.ok) process.exitCode = 1;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
