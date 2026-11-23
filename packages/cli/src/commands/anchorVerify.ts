import { parseAnchor, readAnchorTx } from "../../../core/src/anchor.ts";
import { txUrl } from "../../../core/src/explorer.ts";
import { logRoot, verifyChain } from "../../../core/src/log.ts";
import type { Ctx } from "../index.ts";

export async function anchorVerify(txHash: string, logFile: string, ctx: Ctx): Promise<void> {
  if (!txHash || !logFile) throw new Error("usage: skillmark anchor-verify <txHash> <log.jsonl>");
  const chain = verifyChain(logFile);
  if (!chain.valid) {
    console.log(`MISMATCH — log chain invalid: ${chain.reason}`);
    process.exitCode = 1;
    return;
  }
  const { root, seq } = logRoot(logFile);
  const onChainHex = await readAnchorTx(txHash, ctx.config);
  const parsed = parseAnchor(onChainHex);
  const match = parsed.root.toLowerCase() === root.toLowerCase() && parsed.seq === BigInt(seq);
  console.log(`anchor tx: ${txUrl(txHash, ctx.config.caip2)}`);
  console.log(`log root:  ${root}`);
  console.log(`chain root: ${parsed.root}`);
  console.log(`seq: log ${seq} / chain ${parsed.seq.toString()}`);
  console.log(match ? "MATCH" : "MISMATCH");
  if (!match) process.exitCode = 1;
}
