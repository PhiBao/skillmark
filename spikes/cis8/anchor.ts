/** T03 spike B, part 4: 45-byte RegisterData anchor from hermes, plus a 257-byte limit probe. */
import { AccountAddress, DataBlob, Transaction, TransactionExpiry } from "@concordium/web-sdk";
import { grpc, loadState, saveState, wallet } from "./registerKey.ts";

async function registerData(bytes: Buffer, label: string): Promise<string> {
  const w = wallet(label);
  const sender = AccountAddress.fromBase58(w.address);
  const nonce = await grpc.getNextAccountNonce(sender);
  // DataBlob.fromJSON expects a length-prefixed hex string; the constructor takes raw bytes.
  const tx = Transaction.registerData({ data: new DataBlob(Uint8Array.from(bytes).buffer) })
    .addMetadata({ sender, nonce: nonce.nonce, expiry: TransactionExpiry.futureMinutes(10) })
    .build();
  const finalized = await Transaction.signAndFinalize(tx, w.signer);
  const hash = await grpc.sendTransaction(finalized);
  await grpc.waitForTransactionFinalization(hash);
  return hash.toString();
}

async function main(): Promise<void> {
  // "SKM1" || version 0x01 || 32-byte root || u64-be seq
  const root = Buffer.alloc(32, 0);
  const seq = Buffer.alloc(8);
  seq.writeBigUInt64BE(1n);
  const payload45 = Buffer.concat([Buffer.from("534b4d31", "hex"), Buffer.from([1]), root, seq]);
  if (payload45.length !== 45) throw new Error(`expected 45 bytes, got ${payload45.length}`);
  const anchorTx = await registerData(payload45, "hermes");

  const probes: Array<{ bytes: number; tx?: string; error?: string }> = [];
  for (const size of [256, 257, 512]) {
    try {
      const tx = await registerData(Buffer.alloc(size, 0x41), "hermes");
      probes.push({ bytes: size, tx });
    } catch (error) {
      probes.push({ bytes: size, error: String(error) });
    }
  }
  saveState({ anchorTx, anchorSizeProbes: probes });
  console.log(
    JSON.stringify(
      {
        payloadHex: payload45.toString("hex"),
        payloadBytes: payload45.length,
        anchorTx,
        probes,
      },
      null,
      2,
    ),
  );
}

await main();
