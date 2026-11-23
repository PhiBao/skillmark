import { parseAnchor, readAnchorTx } from "../../../core/src/anchor.ts";
import { txUrl } from "../../../core/src/explorer.ts";
import { rootAtSeq, verifyChain } from "../../../core/src/log.ts";
import type { Ctx } from "../index.ts";

export async function anchorVerify(txHash: string, logFile: string, ctx: Ctx): Promise<void> {
  if (!txHash || !logFile) throw new Error("usage: skillmark anchor-verify <txHash> <log.jsonl>");
  const chain = verifyChain(logFile);
  if (!chain.valid) {
    console.log(`MISMATCH — log chain invalid: ${chain.reason}`);
    process.exitCode = 1;
    return;
  }
  const onChainHex = await readAnchorTx(txHash, ctx.config);
  const parsed = parseAnchor(onChainHex);
  // The anchor commits to entries 0..seq; an `anchor` entry appended afterwards is
  // covered by the *next* anchor, so compare the hash at the anchored sequence.
  const root = rootAtSeq(logFile, Number(parsed.seq));
  const match = root !== undefined && root.toLowerCase() === parsed.root.toLowerCase();
  console.log(`anchor tx: ${txUrl(txHash, ctx.config.caip2)}`);
  console.log(`log root at seq ${parsed.seq}: ${root ?? "<missing>"}`);
  console.log(`chain root:  ${parsed.root}`);
  console.log(match ? "MATCH" : "MISMATCH");
  if (!match) process.exitCode = 1;
}
