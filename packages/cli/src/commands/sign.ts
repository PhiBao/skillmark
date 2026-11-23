import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { keyPath, loadKey, publicKeyInfo } from "../../../core/src/keys.ts";
import { buildManifest } from "../../../core/src/manifest.ts";
import { buildStatement, signStatement } from "../../../core/src/signature.ts";
import { SIGNATURE_FILE } from "../../../core/src/types.ts";
import type { Ctx } from "../index.ts";

export async function sign(dir: string, label: string, ctx: Ctx): Promise<void> {
  if (!dir || !label) throw new Error("usage: skillmark sign <dir> --key <label>");
  const key = loadKey(keyPath(ctx.keysDir, label));
  const { manifest, manifestHash } = await buildManifest(dir);
  const statement = buildStatement(
    { manifestHash, name: manifest.name, version: manifest.version, key },
    ctx.config,
  );
  const signature = signStatement(statement, key);
  const file = join(dir, SIGNATURE_FILE);
  writeFileSync(file, `${JSON.stringify(signature, null, 2)}\n`, { mode: 0o644 });
  console.log(
    JSON.stringify(
      {
        skill: manifest.name,
        version: manifest.version,
        manifestHash,
        signatureFile: file,
        key: publicKeyInfo(key),
      },
      null,
      2,
    ),
  );
}
