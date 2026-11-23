import {
  AccountAddress,
  type AccountSigner,
  CcdAmount,
  DataBlob,
  SequenceNumber,
  Transaction,
  TransactionExpiry,
} from "@concordium/web-sdk";
import { nextNonce, sendAndFinalize } from "./chain.js";
import { loadConfig, type NetworkConfig } from "./config.js";

export const ANCHOR_MAGIC = "SKM1";
export const ANCHOR_VERSION = 1;
export const ANCHOR_BYTES = 45;

/** "SKM1" ‖ version 0x01 ‖ 32-byte root ‖ seq u64 big-endian (A§4.10). */
export function anchorPayload(rootHex: string, seq: number | bigint): Buffer {
  if (!/^[0-9a-f]{64}$/.test(rootHex)) throw new Error("Anchor root must be 32 bytes of hex");
  const seqBytes = Buffer.alloc(8);
  seqBytes.writeBigUInt64BE(BigInt(seq));
  const payload = Buffer.concat([
    Buffer.from(ANCHOR_MAGIC, "ascii"),
    Buffer.from([ANCHOR_VERSION]),
    Buffer.from(rootHex, "hex"),
    seqBytes,
  ]);
  if (payload.length !== ANCHOR_BYTES)
    throw new Error(`Expected ${ANCHOR_BYTES} bytes, got ${payload.length}`);
  return payload;
}

export interface ParsedAnchor {
  magic: string;
  version: number;
  root: string;
  seq: bigint;
}

export function parseAnchor(data: string | Uint8Array): ParsedAnchor {
  const bytes =
    typeof data === "string" ? Buffer.from(data.replace(/^0x/, ""), "hex") : Buffer.from(data);
  if (bytes.length !== ANCHOR_BYTES)
    throw new Error(`Anchor must be ${ANCHOR_BYTES} bytes, got ${bytes.length}`);
  const magic = bytes.subarray(0, 4).toString("ascii");
  if (magic !== ANCHOR_MAGIC) throw new Error(`Bad anchor magic: ${magic}`);
  const version = bytes[4];
  if (version !== ANCHOR_VERSION) throw new Error(`Unsupported anchor version: ${version}`);
  return {
    magic,
    version,
    root: bytes.subarray(5, 37).toString("hex"),
    seq: bytes.readBigUInt64BE(37),
  };
}

/** Send an anchor RegisterData transaction from the Hermes account. */
export async function sendAnchor(
  wallet: { address: string; signer: AccountSigner },
  rootHex: string,
  seq: number | bigint,
  config: NetworkConfig = loadConfig(),
): Promise<string> {
  const sender = AccountAddress.fromBase58(wallet.address);
  const tx = Transaction.registerData({
    data: new DataBlob(Uint8Array.from(anchorPayload(rootHex, seq)).buffer),
  })
    .addMetadata({
      sender,
      nonce: SequenceNumber.create(await nextNonce(sender, config)),
      expiry: TransactionExpiry.futureMinutes(10),
    })
    .build();
  const sent = await sendAndFinalize(tx, wallet, config);
  return sent.txHash;
}

/** Read the data blob of a finalized transaction, if it is a registerData payload. */
export async function readAnchorTx(
  txHash: string,
  config: NetworkConfig = loadConfig(),
): Promise<string> {
  const { getClient } = await import("./chain.js");
  const { TransactionHash } = await import("@concordium/web-sdk");
  const status = await getClient(config).getBlockItemStatus(TransactionHash.fromHexString(txHash));
  const outcome = "outcome" in status ? status.outcome : undefined;
  const summary = outcome?.summary;
  if (!summary || (summary as { transactionType?: string }).transactionType !== "registerData")
    throw new Error("Transaction is not registerData");
  const data = (summary as { dataRegistered?: { data?: unknown } }).dataRegistered?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "toString" in data)
    return String((data as { toString(): string }).toString());
  throw new Error("Transaction has no data blob");
}
