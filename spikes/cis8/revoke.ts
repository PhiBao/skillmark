/** T03 spike B, part 3: revoke the CIS-8 key and read ownerOfKey again from both sources. */

import { readOwner } from "./ownerOf.ts";
import {
  KEY_TYPE,
  loadState,
  mcp,
  NAMESPACE,
  saveState,
  submitContract,
  wallet,
} from "./registerKey.ts";

async function main(): Promise<void> {
  const state = loadState();
  const build = await mcp("build_cis8_revoke", {
    identifier: { namespace: NAMESPACE, key_type: KEY_TYPE, public_key_hex: state.publicKeyHex },
    sender: wallet("alice").address,
  });
  console.log("build_cis8_revoke output:", JSON.stringify(build, null, 2));
  const revokeTx = await submitContract(build, "alice");
  const result = await readOwner(state.publicKeyHex);
  saveState({ revokeTx, ownerAfter: result });
  console.log(JSON.stringify({ phase: "after-revoke", revokeTx, ...result }, null, 2));
}

await main();
