import { generateKey, keyPath, publicKeyInfo, saveKey } from "../../../core/src/keys.ts";
import type { Ctx } from "../index.ts";

export async function keygen(label: string, ctx: Ctx): Promise<void> {
  if (!label) throw new Error("usage: skillmark keygen <label>");
  const key = generateKey(label);
  const file = keyPath(ctx.keysDir, label);
  saveKey(key, file);
  console.log(JSON.stringify({ ...publicKeyInfo(key), file }, null, 2));
}
