import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import express from "express";
import { c as pack } from "tar";
import { afterEach, describe, expect, it } from "vitest";
import { nextNonce, sendAndFinalize } from "../../../packages/core/src/chain.ts";
import { signCis8Proof } from "../../../packages/core/src/cis8.ts";
import { loadConfig } from "../../../packages/core/src/config.ts";
import { generateKey, KEY_TYPE, SKILLMARK_NAMESPACE } from "../../../packages/core/src/keys.ts";
import { buildManifest } from "../../../packages/core/src/manifest.ts";
import {
  buildCis8CanonicalBytes,
  buildRegisterTx,
  buildRevokeTx,
} from "../../../packages/core/src/registryMcp.ts";
import { buildStatement, signStatement } from "../../../packages/core/src/signature.ts";
import { SIGNATURE_FILE } from "../../../packages/core/src/types.ts";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import { createFacilitator, mountFacilitator } from "../../index/src/facilitator.ts";
import { createApp } from "../../index/src/server.ts";
import { openStore } from "../../index/src/store.ts";
import { hermesList, hermesUninstall } from "../src/hermes.ts";

const dirs: string[] = [];
const servers: Array<{ close: () => void }> = [];
let client: Client | undefined;
let transport: StdioClientTransport | undefined;
let indexServer: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;

const OWNER = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";
const reader: RegistryReader = {
  ownerOfKeyOnChain: async () => ({
    found: true,
    ownerAccount: OWNER,
    status: "Active",
    lastUpdated: "2026-11-23T07:00:00.000Z",
  }),
  ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Active" }),
  checkBadge: async () => ({ agents: [] }),
};

afterEach(async () => {
  if (client) await client.close();
  if (transport) await transport.close();
  if (indexServer) indexServer.close();
  for (const server of servers.splice(0)) server.close();
  client = undefined;
  transport = undefined;
  indexServer = undefined;
  await hermesUninstall("invoice-parser");
  await hermesUninstall("paid-skill");
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Register the freshly generated key on testnet so the e2e uses the real trust root. */
async function registerTestKey(key: ReturnType<typeof generateKey>): Promise<void> {
  const config = loadConfig();
  const canonical = await buildCis8CanonicalBytes(
    {
      concordium_account: OWNER,
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
        { key: "label", value: "e2e" },
      ],
      sender: OWNER,
    },
    { config },
  );
  const walletExport = parseWallet(
    readFileSync(join(homedir(), ".skillmark", "wallets", "alice.export"), "utf8"),
  );
  const sender = AccountAddress.fromBase58(OWNER);
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
  await sendAndFinalize(
    tx,
    {
      address: sender,
      signer: buildBasicAccountSigner(walletExport.value.accountKeys.keys[0].keys[0].signKey),
    },
    config,
  );
}

async function revokeTestKey(key: ReturnType<typeof generateKey>): Promise<void> {
  const config = loadConfig();
  const build = await buildRevokeTx(
    {
      identifier: {
        namespace: SKILLMARK_NAMESPACE,
        key_type: KEY_TYPE,
        public_key_hex: key.public_key_hex,
      },
      sender: OWNER,
    },
    { config },
  );
  const walletExport = parseWallet(
    readFileSync(join(homedir(), ".skillmark", "wallets", "alice.export"), "utf8"),
  );
  const sender = AccountAddress.fromBase58(OWNER);
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
  await sendAndFinalize(
    tx,
    {
      address: sender,
      signer: buildBasicAccountSigner(walletExport.value.accountKeys.keys[0].keys[0].signKey),
    },
    config,
  );
}

async function makeListing(
  dataDir: string,
  name: string,
  tampered: boolean,
): Promise<{
  manifestHash: string;
  bundleSha256: string;
  sig: string;
  key: ReturnType<typeof generateKey>;
}> {
  const skill = mkdtempSync(join(tmpdir(), "skillmark-e2e-skill-"));
  dirs.push(skill);
  writeFileSync(
    join(skill, "SKILL.md"),
    `---\nname: ${name}\ndescription: Parse invoices.\nversion: 1.0.0\n---\n# Parser\n`,
  );
  const key = generateKey(name);
  await registerTestKey(key);
  const { manifestHash } = await buildManifest(skill);
  const statement = buildStatement({ manifestHash, name, version: "1.0.0", key });
  const sig = signStatement(statement, key);
  writeFileSync(join(skill, SIGNATURE_FILE), JSON.stringify(sig));
  if (tampered)
    writeFileSync(
      join(skill, "SKILL.md"),
      "---\nname: " + name + "\ndescription: CHANGED\nversion: 1.0.0\n---\n# Changed\n",
    );
  const bundle = join(skill, "..", `${name}.tgz`);
  dirs.push(bundle);
  await pack({ gzip: true, cwd: skill, file: bundle }, ["./"]);
  const bytes = readFileSync(bundle);
  const bundleSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  mkdirSync(join(dataDir, "bundles"), { recursive: true });
  writeFileSync(join(dataDir, "bundles", `${bundleSha256.slice(7)}.tgz`), bytes);
  return { manifestHash, bundleSha256, sig: JSON.stringify(sig), key };
}

describe("MCP e2e with local Hermes", () => {
  it("installs a verified skill through the scanner and refuses a tampered one", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "skillmark-e2e-index-"));
    dirs.push(dataDir);
    const store = openStore(dataDir);
    const good = await makeListing(dataDir, "invoice-parser", false);
    const bad = await makeListing(dataDir, "tampered-skill", true);
    const paid = await makeListing(dataDir, "paid-skill", false);
    store.insertListing({
      name: "invoice-parser",
      version: "1.0.0",
      description: "Parse invoices.",
      manifestHash: good.manifestHash,
      sig: good.sig,
      bundleSha256: good.bundleSha256,
      sizeBytes: 0,
      price: null,
      payTo: null,
      publisherAccount: OWNER,
      status: "verified",
      publishedAt: new Date().toISOString(),
    });
    store.insertListing({
      name: "tampered-skill",
      version: "1.0.0",
      description: "Tampered.",
      manifestHash: bad.manifestHash,
      sig: bad.sig,
      bundleSha256: bad.bundleSha256,
      sizeBytes: 0,
      price: null,
      payTo: null,
      publisherAccount: OWNER,
      status: "verified",
      publishedAt: new Date().toISOString(),
    });
    store.insertListing({
      name: "paid-skill",
      version: "1.0.0",
      description: "Paid skill.",
      manifestHash: paid.manifestHash,
      sig: paid.sig,
      bundleSha256: paid.bundleSha256,
      sizeBytes: 0,
      price: JSON.stringify({ amountMicroCcd: "250000", asset: "CCD" }),
      payTo: OWNER,
      publisherAccount: OWNER,
      status: "verified",
      publishedAt: new Date().toISOString(),
    });

    const handle = createFacilitator({
      store,
      sponsorWalletFile: join(homedir(), ".skillmark", "wallets", "sponsor.export"),
    });
    const facilitatorApp = express();
    facilitatorApp.use(express.json());
    mountFacilitator(facilitatorApp, handle);
    const facilitatorListener = facilitatorApp.listen(0, "127.0.0.1");
    servers.push(facilitatorListener);
    await new Promise<void>((resolve) => facilitatorListener.once("listening", resolve));
    const facilitatorUrl = `http://127.0.0.1:${(facilitatorListener.address() as AddressInfo).port}/facilitator`;

    const app = createApp({ store, dataDir, facilitatorUrl });
    const listener = app.listen(0, "127.0.0.1");
    indexServer = listener;
    await new Promise<void>((resolve) => listener.once("listening", resolve));
    const indexUrl = `http://0.0.0.0:${(listener.address() as AddressInfo).port}`.replace(
      "0.0.0.0",
      "127.0.0.1",
    );

    const stateDir = mkdtempSync(join(tmpdir(), "skillmark-e2e-state-"));
    dirs.push(stateDir);
    const serverPath = fileURLToPath(new URL("../src/server.ts", import.meta.url));
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", serverPath],
      env: {
        ...process.env,
        SKILLMARK_INDEX_URL: indexUrl,
        SKILLMARK_STATE_DIR: stateDir,
      } as Record<string, string>,
    });
    client = new Client({ name: "skillmark-e2e", version: "1.0.0" });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["verify_skill", "install_skill"]),
    );

    const verified = await client.callTool({
      name: "verify_skill",
      arguments: { name: "invoice-parser" },
    });
    expect(String((verified.content as Array<{ text: string }>)[0].text)).toContain("VERIFIED");

    const installed = await client.callTool({
      name: "install_skill",
      arguments: { name: "invoice-parser" },
    });
    const installedText = String((installed.content as Array<{ text: string }>)[0].text);
    expect(installedText).toContain("Hermes scanner: safe");
    expect(installedText).toContain("installed");

    const paidInstall = await client.callTool({
      name: "install_skill",
      arguments: { name: "paid-skill" },
    });
    const paidText = String((paidInstall.content as Array<{ text: string }>)[0].text);
    expect(paidText).toContain("paid 0.25 CCD on delivery");
    expect(paidText).toMatch(/tx [0-9a-f]{64}/);
    expect(paidText).toContain("Hermes scanner: safe");
    const spend = JSON.parse(readFileSync(join(stateDir, "spend.json"), "utf8")) as {
      totalMicroCcd: string;
      payments: Array<{ txHash: string }>;
    };
    expect(spend.totalMicroCcd).toBe("250000");
    expect(spend.payments[0].txHash).toMatch(/^[0-9a-f]{64}$/);

    const blocked = await client.callTool({
      name: "install_skill",
      arguments: { name: "tampered-skill" },
    });
    const blockedText = String((blocked.content as Array<{ text: string }>)[0].text);
    expect(blockedText).toContain("TAMPERED");
    expect(blockedText).toContain("Not installed");

    // Revoke the signing key used for the install, then audit: the skill must be quarantined.
    await revokeTestKey(good.key);
    const audited = await client.callTool({ name: "audit_installed", arguments: {} });
    const auditText = String((audited.content as Array<{ text: string }>)[0].text);
    expect(auditText).toContain("QUARANTINED");
    expect(auditText).toContain("invoice-parser");
    const list = await hermesList();
    expect(list.stdout).not.toContain("invoice-parser");
  }, 240_000);
});
