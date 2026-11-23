/**
 * T20: reset the demo to a clean, working state.
 * Creates and registers a fresh `alice-k2`, re-signs the fixtures, republishes them,
 * clears demo installs (quarantine kept) and resets spend counters.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AccountAddress,
  buildBasicAccountSigner,
  CcdAmount,
  ContractAddress,
  Energy,
  Parameter,
  parseWallet,
  ReceiveName,
  SequenceNumber,
  Transaction,
  TransactionExpiry,
} from "@concordium/web-sdk";
import { c as pack } from "tar";
import { nextNonce, sendAndFinalize } from "../packages/core/src/chain.ts";
import { signCis8Proof } from "../packages/core/src/cis8.ts";
import { findRepoRoot, loadConfig } from "../packages/core/src/config.ts";
import {
  generateKey,
  KEY_TYPE,
  keyPath,
  loadKey,
  SKILLMARK_NAMESPACE,
  saveKey,
} from "../packages/core/src/keys.ts";
import { buildManifest, parseFrontmatter } from "../packages/core/src/manifest.ts";
import { buildCis8CanonicalBytes, buildRegisterTx } from "../packages/core/src/registryMcp.ts";
import { buildStatement, signStatement } from "../packages/core/src/signature.ts";
import { SIGNATURE_FILE } from "../packages/core/src/types.ts";

const config = loadConfig();
const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const indexUrl = (process.env.INDEX_PUBLIC_URL ?? "https://skillmark-index.onrender.com").replace(
  /\/$/,
  "",
);
const keysDir = process.env.SKILLMARK_KEYS_DIR ?? join(homedir(), ".skillmark", "keys");

function wallet(label: string) {
  const file = join(homedir(), ".skillmark", "wallets", `${label}.export`);
  const parsed = parseWallet(readFileSync(file, "utf8"));
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

async function registerKey(label: string): Promise<string> {
  const key = generateKey(label);
  saveKey(key, keyPath(keysDir, label));
  const alice = wallet("alice");
  const canonical = await buildCis8CanonicalBytes(
    {
      concordium_account: alice.address,
      external_namespace: SKILLMARK_NAMESPACE,
      external_key_namespace: SKILLMARK_NAMESPACE,
      external_key_type: KEY_TYPE,
      external_public_key_hex: key.public_key_hex,
      proof_scheme: "solana-ed25519",
    },
    { config },
  );
  const build = await buildRegisterTx(
    {
      external_key: {
        namespace: SKILLMARK_NAMESPACE,
        key_type: KEY_TYPE,
        public_key_hex: key.public_key_hex,
      },
      proof: {
        scheme: "solana-ed25519",
        signature_hex: signCis8Proof(canonical.bytes_hex, key.private_key_hex),
      },
      metadata: [
        { key: "purpose", value: "skillmark-signing" },
        { key: "label", value: label },
      ],
      sender: alice.address,
    },
    { config },
  );
  const sender = AccountAddress.fromBase58(alice.address);
  const tx = Transaction.updateContract(
    {
      amount: CcdAmount.fromMicroCcd(0n),
      address: ContractAddress.create(
        build.contract_address.index,
        build.contract_address.subindex,
      ),
      receiveName: ReceiveName.fromString(build.receive_name),
      message: Parameter.fromHexString(build.parameter_hex),
    },
    Energy.create(build.suggested_energy),
  )
    .addMetadata({
      sender,
      nonce: SequenceNumber.create(await nextNonce(sender, config)),
      expiry: TransactionExpiry.futureMinutes(10),
    })
    .build();
  const sent = await sendAndFinalize(tx, { address: sender, signer: alice.signer }, config);
  return sent.txHash;
}

async function signDir(
  dir: string,
  keyFile: string,
): Promise<{ manifestHash: string; sig: unknown }> {
  const key = loadKey(keyFile);
  const { manifest, manifestHash } = await buildManifest(dir);
  const statement = buildStatement(
    { manifestHash, name: manifest.name, version: manifest.version, key },
    config,
  );
  const sig = signStatement(statement, key);
  writeFileSync(join(dir, SIGNATURE_FILE), `${JSON.stringify(sig, null, 2)}\n`);
  return { manifestHash, sig };
}

async function publish(
  dir: string,
  options: { priceCcd: number; payTo: string | null; publisher: string },
): Promise<void> {
  const { manifest, manifestHash } = await buildManifest(dir);
  const sig = JSON.parse(readFileSync(join(dir, SIGNATURE_FILE), "utf8"));
  const temp = join(repoRoot, ".demo-reset-bundle.tgz");
  await pack({ gzip: true, portable: true, cwd: dir, file: temp }, ["./"]);
  const bytes = readFileSync(temp);
  rmSync(temp, { force: true });
  const listing = {
    name: manifest.name,
    version: manifest.version,
    description: parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8")).description ?? "",
    manifestHash,
    sig,
    bundleSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    sizeBytes: bytes.length,
    price:
      options.priceCcd === 0
        ? null
        : { amountMicroCcd: String(BigInt(Math.round(options.priceCcd * 1e6))), asset: "CCD" },
    payTo: options.payTo,
    publisherAccount: options.publisher,
  };
  const form = new FormData();
  form.set("bundle", new Blob([bytes], { type: "application/gzip" }), "bundle.tgz");
  form.set("listing", JSON.stringify(listing));
  const response = await fetch(`${indexUrl}/api/publish`, { method: "POST", body: form });
  if (!response.ok)
    throw new Error(`publish ${manifest.name}: HTTP ${response.status} ${await response.text()}`);
  console.log(
    `published ${manifest.name}@${manifest.version} ${options.priceCcd === 0 ? "free" : `${options.priceCcd} CCD`}`,
  );
}

async function main(): Promise<void> {
  const health = await fetch(`${indexUrl}/healthz`);
  if (!health.ok) throw new Error(`Index is not healthy: HTTP ${health.status}`);

  console.log("— alice-k2");
  const registerTx = await registerKey("alice-k2");
  console.log(`registered alice-k2: ${registerTx}`);

  console.log("— fixtures");
  const invoiceDir = join(repoRoot, "fixtures", "skills", "invoice-parser");
  await signDir(invoiceDir, keyPath(keysDir, "alice-k2"));

  const tamperedDir = join(repoRoot, "fixtures", "skills", "tampered", "invoice-parser");
  rmSync(tamperedDir, { recursive: true, force: true });
  cpSync(invoiceDir, tamperedDir, { recursive: true });
  const tamperedSkill = readFileSync(join(tamperedDir, "SKILL.md"), "utf8");
  writeFileSync(
    join(tamperedDir, "SKILL.md"),
    tamperedSkill.replace("A small fixture skill", "A TAMPERED fixture skill"),
  );
  writeFileSync(
    join(tamperedDir, "FIXTURE.md"),
    "# FIXTURE — tampered invoice-parser\n\nSigned copy whose contents were changed after signing. `skillmark verify` must say TAMPERED and no agent may install it. Never executed.\n",
  );

  const unsignedDir = join(repoRoot, "fixtures", "skills", "unsigned", "invoice-parser");
  rmSync(unsignedDir, { recursive: true, force: true });
  cpSync(invoiceDir, unsignedDir, { recursive: true });
  rmSync(join(unsignedDir, SIGNATURE_FILE), { force: true });
  writeFileSync(
    join(unsignedDir, "FIXTURE.md"),
    "# FIXTURE — unsigned invoice-parser\n\nNo signature file. `skillmark verify` must say UNSIGNED and no agent may install it. Never executed.\n",
  );

  console.log("— publish");
  const alice = wallet("alice");
  await publish(invoiceDir, { priceCcd: 0, payTo: null, publisher: alice.address });

  const hermesSkills = join(homedir(), ".hermes", "skills", "meeting-notes");
  const meetingFixture = join(repoRoot, "fixtures", "skills", "hermes-made", "meeting-notes");
  if (!existsSync(hermesSkills)) cpSync(meetingFixture, hermesSkills, { recursive: true });
  const hermes = wallet("hermes");
  await signDir(hermesSkills, keyPath(keysDir, "hermes"));
  await publish(hermesSkills, { priceCcd: 0.25, payTo: hermes.address, publisher: hermes.address });

  console.log("— clear installs (quarantine kept)");
  const { execFile } = await import("node:child_process");
  const uninstall = (name: string, profile?: string) =>
    new Promise<void>((resolve) => {
      const env = profile ? { ...process.env, HERMES_PROFILE: profile } : process.env;
      execFile(
        process.env.HERMES_BIN ?? "hermes",
        ["skills", "uninstall", name, "--yes"],
        { env },
        () => resolve(),
      );
    });
  for (const profile of [undefined, "buyer-b"]) {
    await uninstall("invoice-parser", profile);
    await uninstall("meeting-notes", profile);
  }

  console.log("— reset counters");
  for (const stateDir of [
    join(homedir(), ".hermes", "skillmark"),
    join(homedir(), ".hermes", "profiles", "buyer-b", "skillmark"),
  ]) {
    for (const file of ["spend.json", "installed.json"])
      rmSync(join(stateDir, file), { force: true });
  }

  const skills = (await (await fetch(`${indexUrl}/api/skills`)).json()) as Array<{
    name: string;
    version: string;
    status: string;
    price: unknown;
  }>;
  console.log("\nDEMO STATE");
  console.log(`index          ${indexUrl} healthy`);
  console.log(`publisher key  alice-k2 ${loadKey(keyPath(keysDir, "alice-k2")).public_key_hex}`);
  console.log(`register tx    ${registerTx}`);
  console.log(
    `listings       ${skills.map((skill) => `${skill.name}@${skill.version}:${skill.status}${skill.price ? ":paid" : ":free"}`).join(", ")}`,
  );
  console.log(
    "fixtures       invoice-parser, tampered, unsigned, env-reporter(danger), hermes-made/meeting-notes",
  );
  console.log("installs       cleared; quarantine dirs kept");
  console.log("spend          reset");
}

await main();
