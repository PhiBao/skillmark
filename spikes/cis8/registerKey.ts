/** T03 spike B, part 1: CIS-8 register with a fresh ed25519 key in a custom namespace. */
import { readFileSync, writeFileSync } from "node:fs";
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
  Transaction,
  TransactionExpiry,
} from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/curves/utils.js";

export const NETWORK = "testnet" as const;
export const NAMESPACE = "skillmark:v1";
export const KEY_TYPE = "ed25519";
export const PROOF_SCHEME = "solana-ed25519";
export const STATE_FILE = join(homedir(), ".skillmark", "spike-cis8-state.json");

export const grpc = new ConcordiumGRPCNodeClient(
  "grpc.testnet.concordium.com",
  20000,
  credentials.createSsl(),
);

export interface SpikeState {
  publicKeyHex: string;
  registerTx: string;
  canonicalBytesHex?: string;
  proofSignatureHex?: string;
  revokeTx?: string;
  ownerBefore?: unknown;
  ownerAfter?: unknown;
  anchorTx?: string;
  anchorTooLongError?: string;
  anchorSizeProbes?: Array<{ bytes: number; tx?: string; error?: string }>;
  agentTx?: string;
  tokenId?: string;
  badge?: string;
  agent?: Record<string, unknown>;
}

export function loadState(): SpikeState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as SpikeState;
}
export function saveState(patch: Partial<SpikeState>): SpikeState {
  let current: Partial<SpikeState> = {};
  try {
    current = loadState();
  } catch {
    // first run
  }
  const next = { ...current, ...patch };
  writeFileSync(STATE_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next as SpikeState;
}

/** JSON-RPC call to the Concordium Registry MCP. Always testnet. */
export async function mcp(name: string, args: Record<string, unknown>): Promise<any> {
  const response = await fetch("https://agent-registry-mcp.concordium.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: { ...args, network: NETWORK } },
    }),
  });
  const body = (await response.json()) as any;
  if (body.error) throw new Error(`${name}: ${JSON.stringify(body.error)}`);
  const text = body.result?.content?.[0]?.text;
  if (!text) throw new Error(`${name}: empty tool result`);
  return JSON.parse(text);
}

export function wallet(label: string) {
  const file = join(homedir(), ".skillmark", "wallets", `${label}.export`);
  const parsed = parseWallet(readFileSync(file, "utf8"));
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

/** Submit a sign-ready MCP payload as a CIS-8 / CIS-8004 contract update from `label`. */
export async function submitContract(build: any, label: string): Promise<string> {
  const w = wallet(label);
  const sender = AccountAddress.fromBase58(w.address);
  const nonce = await grpc.getNextAccountNonce(sender);
  const tx = Transaction.updateContract(
    {
      amount: CcdAmount.fromMicroCcd(0n),
      address: ContractAddress.create(
        BigInt(build.contract_address.index),
        BigInt(build.contract_address.subindex),
      ),
      receiveName: ReceiveName.fromString(build.receive_name),
      message: Parameter.fromHexString(build.parameter_hex),
    },
    Energy.create(BigInt(build.suggested_energy ?? 30000)),
  )
    .addMetadata({ sender, nonce: nonce.nonce, expiry: TransactionExpiry.futureMinutes(10) })
    .build();
  const finalized = await Transaction.signAndFinalize(tx, w.signer);
  const hash = await grpc.sendTransaction(finalized);
  await grpc.waitForTransactionFinalization(hash);
  return hash.toString();
}

async function main(): Promise<void> {
  const alice = wallet("alice").address;
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKeyHex = bytesToHex(ed25519.getPublicKey(privateKey));

  const canonical = await mcp("build_cis8_canonical_bytes", {
    concordium_account: alice,
    external_namespace: NAMESPACE,
    external_key_namespace: NAMESPACE,
    external_key_type: KEY_TYPE,
    external_public_key_hex: publicKeyHex,
    proof_scheme: PROOF_SCHEME,
  });
  // solana-ed25519: sign the exact canonical bytes, no wrapping (A§4.5).
  const proofSignatureHex = bytesToHex(
    ed25519.sign(Buffer.from(canonical.bytes_hex, "hex"), privateKey),
  );

  const build = await mcp("build_cis8_register", {
    external_key: { namespace: NAMESPACE, key_type: KEY_TYPE, public_key_hex: publicKeyHex },
    proof: { scheme: PROOF_SCHEME, signature_hex: proofSignatureHex },
    metadata: [
      { key: "purpose", value: "skillmark-signing" },
      { key: "label", value: "t03-spike" },
    ],
    sender: alice,
  });
  console.log("build_cis8_register output:", JSON.stringify(build, null, 2));
  const registerTx = await submitContract(build, "alice");
  saveState({
    publicKeyHex,
    registerTx,
    canonicalBytesHex: canonical.bytes_hex,
    proofSignatureHex,
  });
  console.log(
    JSON.stringify(
      { publicKeyHex, registerTx, canonicalBytesHex: canonical.bytes_hex, proofSignatureHex },
      null,
      2,
    ),
  );
}

if (process.argv[1]?.endsWith("registerKey.ts")) await main();
