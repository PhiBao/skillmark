import { readFileSync } from "node:fs";
import { homedir } from "node:os";
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
} from "@concordium/web-sdk";
import { nextNonce, sendAndFinalize } from "../../../core/src/chain.ts";
import { signCis8Proof } from "../../../core/src/cis8.ts";
import { txUrl } from "../../../core/src/explorer.ts";
import { KEY_TYPE, keyPath, loadKey, SKILLMARK_NAMESPACE } from "../../../core/src/keys.ts";
import {
  buildCis8CanonicalBytes,
  buildRegisterTx,
  type RegisterBuild,
} from "../../../core/src/registryMcp.ts";
import type { Ctx } from "../index.ts";

export function walletFile(label: string, ctx: Ctx): string {
  return label === "alice"
    ? ctx.publisherWalletFile
    : join(homedir(), ".skillmark", "wallets", `${label}.export`);
}

export function walletFor(label: string, ctx: Ctx) {
  const parsed = parseWallet(readFileSync(walletFile(label, ctx), "utf8"));
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

/** Submit a sign-ready MCP payload as a contract update and print its explorer link. */
export async function submitBuild(build: RegisterBuild, label: string, ctx: Ctx): Promise<string> {
  const wallet = walletFor(label, ctx);
  const sender = AccountAddress.fromBase58(wallet.address);
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
      nonce: SequenceNumber.create(await nextNonce(sender, ctx.config)),
      expiry: TransactionExpiry.futureMinutes(10),
    })
    .build();
  const sent = await sendAndFinalize(tx, { address: sender, signer: wallet.signer }, ctx.config);
  console.log(`explorer: ${txUrl(sent.txHash, ctx.config.caip2)}`);
  return sent.txHash;
}

export async function registerKey(label: string, ctx: Ctx): Promise<void> {
  if (!label) throw new Error("usage: skillmark register-key <label>");
  const key = loadKey(keyPath(ctx.keysDir, label));
  // The signing key is separate from the account that registers it; default to the publisher.
  const wallet = walletFor("alice", ctx);
  const canonical = await buildCis8CanonicalBytes(
    {
      concordium_account: wallet.address,
      external_namespace: SKILLMARK_NAMESPACE,
      external_key_namespace: SKILLMARK_NAMESPACE,
      external_key_type: KEY_TYPE,
      external_public_key_hex: key.public_key_hex,
      proof_scheme: "solana-ed25519",
    },
    { config: ctx.config },
  );
  const proofSignatureHex = signCis8Proof(canonical.bytes_hex, key.private_key_hex);
  const build = await buildRegisterTx(
    {
      external_key: {
        namespace: SKILLMARK_NAMESPACE,
        key_type: KEY_TYPE,
        public_key_hex: key.public_key_hex,
      },
      proof: { scheme: "solana-ed25519", signature_hex: proofSignatureHex },
      metadata: [
        { key: "purpose", value: "skillmark-signing" },
        { key: "label", value: label },
      ],
      sender: wallet.address,
    },
    { config: ctx.config },
  );
  const txHash = await submitBuild(build, "alice", ctx);
  console.log(
    JSON.stringify({ label, publicKeyHex: key.public_key_hex, registeredTx: txHash }, null, 2),
  );
}
