import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildBasicAccountSigner, parseWallet } from "@concordium/web-sdk";
import { c as pack } from "tar";
import { loadKey } from "../../../../packages/core/src/keys.ts";
import { appendEntry } from "../../../../packages/core/src/log.ts";
import { buildManifest, parseFrontmatter } from "../../../../packages/core/src/manifest.ts";
import { buildStatement, signStatement } from "../../../../packages/core/src/signature.ts";
import { SIGNATURE_FILE } from "../../../../packages/core/src/types.ts";
import { stateDir } from "../state.ts";
import type { McpConfig } from "./verify.ts";

function hermesHome(): string {
  return process.env.HERMES_HOME ?? join(homedir(), ".hermes");
}

function hermesKeyFile(): string {
  return (
    process.env.HERMES_SIGNING_KEY_FILE ?? join(homedir(), ".skillmark", "keys", "hermes.json")
  );
}

function hermesWallet() {
  const file =
    process.env.HERMES_WALLET_FILE ?? join(homedir(), ".skillmark", "wallets", "hermes.export");
  const parsed = parseWallet(readFileSync(file, "utf8"));
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

/** Publish a skill created by Hermes, signed with the Hermes key, payTo = Hermes. */
export async function publishSkill(
  path: string,
  priceCcd: number,
  config: McpConfig,
  description?: string,
): Promise<string> {
  const home = resolve(hermesHome());
  const skillsRoot = join(home, "skills");
  const target = resolve(path);
  if (!(target === skillsRoot || target.startsWith(`${skillsRoot}${sep}`))) {
    throw new Error("publish_skill path must be inside HERMES_HOME/skills");
  }
  if (!Number.isFinite(priceCcd) || priceCcd < 0 || priceCcd > 1)
    throw new Error("Price must be between 0 and 1 CCD (D7)");

  const key = loadKey(hermesKeyFile());
  const wallet = hermesWallet();
  const { manifest, manifestHash } = await buildManifest(target);
  const statement = buildStatement(
    { manifestHash, name: manifest.name, version: manifest.version, key },
    undefined,
  );
  const signature = signStatement(statement, key);
  writeFileSync(join(target, SIGNATURE_FILE), `${JSON.stringify(signature, null, 2)}\n`);

  const temp = mkdtempSync(join(tmpdir(), "skillmark-hermes-publish-"));
  try {
    const bundlePath = join(temp, "bundle.tgz");
    await pack({ gzip: true, portable: true, cwd: target, file: bundlePath }, ["./"]);
    const bytes = readFileSync(bundlePath);
    const frontmatter = parseFrontmatter(readFileSync(join(target, "SKILL.md"), "utf8"));
    const listing = {
      name: manifest.name,
      version: manifest.version,
      description: description ?? frontmatter.description ?? "",
      manifestHash,
      sig: signature,
      bundleSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      sizeBytes: bytes.length,
      price:
        priceCcd === 0
          ? null
          : { amountMicroCcd: String(BigInt(Math.round(priceCcd * 1e6))), asset: "CCD" },
      payTo: wallet.address,
      publisherAccount: wallet.address,
    };
    const form = new FormData();
    form.set("bundle", new Blob([bytes], { type: "application/gzip" }), "bundle.tgz");
    form.set("listing", JSON.stringify(listing));
    const response = await fetch(`${config.indexUrl.replace(/\/$/, "")}/api/publish`, {
      method: "POST",
      body: form,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`publish failed: HTTP ${response.status} ${body}`);
    try {
      appendEntry(join(stateDir(), "log.jsonl"), "publish", {
        name: manifest.name,
        version: manifest.version,
        priceCcd,
        payTo: wallet.address,
      });
    } catch {
      // Logging is best-effort.
    }
    return `✓ Published ${manifest.name} ${manifest.version} as Hermes\n  payTo ${wallet.address}\n  price ${priceCcd === 0 ? "free" : `${priceCcd} CCD`}\n  manifest ${manifestHash}`;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
