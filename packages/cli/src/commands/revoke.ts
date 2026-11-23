import { KEY_TYPE, keyPath, loadKey, SKILLMARK_NAMESPACE } from "../../../core/src/keys.ts";
import { buildRevokeTx } from "../../../core/src/registryMcp.ts";
import type { Ctx } from "../index.ts";
import { submitBuild, walletFor } from "./registerKey.ts";

export async function revoke(label: string, ctx: Ctx): Promise<void> {
  if (!label) throw new Error("usage: skillmark revoke <label>");
  const key = loadKey(keyPath(ctx.keysDir, label));
  const wallet = walletFor("alice", ctx);
  const build = await buildRevokeTx(
    {
      identifier: {
        namespace: SKILLMARK_NAMESPACE,
        key_type: KEY_TYPE,
        public_key_hex: key.public_key_hex,
      },
      sender: wallet.address,
    },
    { config: ctx.config },
  );
  const txHash = await submitBuild(build, "alice", ctx);
  console.log(JSON.stringify({ label, revokedTx: txHash }, null, 2));
}
