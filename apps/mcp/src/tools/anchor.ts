import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildBasicAccountSigner, parseWallet } from "@concordium/web-sdk";
import { sendAnchor } from "../../../../packages/core/src/anchor.ts";
import { loadConfig } from "../../../../packages/core/src/config.ts";
import { appendEntry, logRoot } from "../../../../packages/core/src/log.ts";
import { stateDir } from "../state.ts";

/** Anchor the current log root on chain from the Hermes account. */
export async function anchorLog(): Promise<string> {
  const logFile = join(stateDir(), "log.jsonl");
  const { root, seq } = logRoot(logFile);
  const walletFile =
    process.env.HERMES_WALLET_FILE ?? join(homedir(), ".skillmark", "wallets", "hermes.export");
  const parsed = parseWallet(readFileSync(walletFile, "utf8"));
  const wallet = {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
  const txHash = await sendAnchor(wallet, root, seq, loadConfig());
  appendEntry(logFile, "anchor", { txHash, root, seq });
  return txHash;
}
