import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
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
  TransactionHash,
} from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import { CONCORDIUM_TESTNET_CAIP2 } from "@x402/concordium";
import { ExactConcordiumScheme } from "@x402/concordium/exact/client";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
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
} from "../../../packages/core/src/registryMcp.ts";
import { buildStatement, signStatement } from "../../../packages/core/src/signature.ts";
import { SIGNATURE_FILE } from "../../../packages/core/src/types.ts";
import { createFacilitator, mountFacilitator } from "../src/facilitator.ts";
import { createApp } from "../src/server.ts";
import { openStore } from "../src/store.ts";

const dirs: string[] = [];
const servers: Array<{ close: () => void }> = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ALICE = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";

function wallet(label: string) {
  const file = join(homedir(), ".skillmark", "wallets", `${label}.export`);
  const parsed = parseWallet(readFileSync(file, "utf8"));
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

async function listen(app: express.Express): Promise<string> {
  const listener = app.listen(0, "127.0.0.1");
  servers.push(listener);
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  return `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
}

async function registerKey(key: ReturnType<typeof generateKey>): Promise<void> {
  const config = loadConfig();
  const canonical = await buildCis8CanonicalBytes(
    {
      concordium_account: ALICE,
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
      metadata: [{ key: "purpose", value: "skillmark-signing" }],
      sender: ALICE,
    },
    { config },
  );
  const alice = wallet("alice");
  const sender = AccountAddress.fromBase58(ALICE);
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
  await sendAndFinalize(tx, { address: sender, signer: alice.signer }, config);
}

async function makeBundle(dataDir: string, name: string, writeBundle = true) {
  const skill = mkdtempSync(join(tmpdir(), "skillmark-pay-skill-"));
  dirs.push(skill);
  writeFileSync(
    join(skill, "SKILL.md"),
    `---\nname: ${name}\ndescription: Paid fixture.\nversion: 1.0.0\n---\n# Paid\n`,
  );
  const key = generateKey(name);
  await registerKey(key);
  const { manifestHash } = await buildManifest(skill);
  const statement = buildStatement({ manifestHash, name, version: "1.0.0", key });
  writeFileSync(join(skill, SIGNATURE_FILE), JSON.stringify(signStatement(statement, key)));
  const bundle = join(skill, "..", `${name}.tgz`);
  dirs.push(bundle);
  await pack({ gzip: true, portable: true, cwd: skill, file: bundle }, ["./"]);
  const bytes = readFileSync(bundle);
  const bundleSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (writeBundle) {
    mkdirSync(join(dataDir, "bundles"), { recursive: true });
    writeFileSync(join(dataDir, "bundles", `${bundleSha256.slice(7)}.tgz`), bytes);
  }
  return { manifestHash, bundleSha256, sig: JSON.stringify(signStatement(statement, key)) };
}

describe("live testnet paid bundle", () => {
  it("settles exactly once and never settles a read error", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "skillmark-pay-live-"));
    dirs.push(dataDir);
    const store = openStore(dataDir);
    const good = await makeBundle(dataDir, "paid-fixture");
    const broken = await makeBundle(dataDir, "broken-fixture", false);

    for (const [name, data, price] of [
      ["paid-fixture", good, "500000"],
      ["broken-fixture", broken, "250000"],
    ] as const) {
      store.insertListing({
        name,
        version: "1.0.0",
        description: "Paid fixture.",
        manifestHash: data.manifestHash,
        sig: data.sig,
        bundleSha256: data.bundleSha256,
        sizeBytes: 0,
        price: JSON.stringify({ amountMicroCcd: price, asset: "CCD" }),
        payTo: ALICE,
        publisherAccount: ALICE,
        status: "verified",
        publishedAt: new Date().toISOString(),
      });
    }

    const handle = createFacilitator({
      store,
      sponsorWalletFile: join(homedir(), ".skillmark", "wallets", "sponsor.export"),
    });
    const facilitatorApp = express();
    facilitatorApp.use(express.json());
    mountFacilitator(facilitatorApp, handle);
    const facilitatorUrl = `${await listen(facilitatorApp)}/facilitator`;
    const base = await listen(createApp({ store, dataDir, facilitatorUrl }));

    const payer = wallet("hermes");
    const client = new x402Client()
      .register(
        "ccd:*",
        new ExactConcordiumScheme({
          accountAddress: AccountAddress.fromBase58(payer.address),
          signer: payer.signer,
        }),
      )
      .setSpendControls({
        allowedAssets: [
          { network: CONCORDIUM_TESTNET_CAIP2, asset: "CCD", maxAmountPerPayment: "1000000" },
        ],
      });
    const pay = wrapFetchWithPayment(fetch, client);

    const response = await pay(`${base}/skills/paid-fixture/1.0.0/bundle.tgz`, {
      signal: AbortSignal.timeout(180_000),
    });
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const settlements = store.settlements("paid-fixture", "1.0.0");
    expect(settlements).toHaveLength(1);
    const txHash = settlements[0].txHash;
    const grpc = new ConcordiumGRPCNodeClient(
      "grpc.testnet.concordium.com",
      20_000,
      credentials.createSsl(),
    );
    const status = await grpc.getBlockItemStatus(TransactionHash.fromHexString(txHash));
    expect(status.status).toBe("finalized");

    let brokenStatus = 0;
    try {
      const brokenResponse = await pay(`${base}/skills/broken-fixture/1.0.0/bundle.tgz`, {
        signal: AbortSignal.timeout(180_000),
      });
      brokenStatus = brokenResponse.status;
    } catch {
      brokenStatus = 500;
    }
    expect(brokenStatus).toBeGreaterThanOrEqual(400);
    expect(store.settlements("broken-fixture", "1.0.0")).toHaveLength(0);
  }, 300_000);
});
