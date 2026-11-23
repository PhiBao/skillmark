import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { z } from "zod";

export const SKILLMARK_NAMESPACE = "skillmark:v1";
export const KEY_TYPE = "ed25519";

export const signingKeySchema = z.object({
  label: z.string().min(1),
  namespace: z.literal(SKILLMARK_NAMESPACE),
  key_type: z.literal(KEY_TYPE),
  public_key_hex: z.string().regex(/^[0-9a-f]{64}$/),
  private_key_hex: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: z.string().min(1),
});

export type SigningKey = z.infer<typeof signingKeySchema>;

/** Public-only view, safe to print or log. Never includes private_key_hex. */
export function publicKeyInfo(key: SigningKey) {
  return {
    label: key.label,
    namespace: key.namespace,
    key_type: key.key_type,
    public_key_hex: key.public_key_hex,
    created_at: key.created_at,
  };
}

/** Generate a fresh ed25519 signing key. Nothing is written to disk. */
export function generateKey(label: string): SigningKey {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    label,
    namespace: SKILLMARK_NAMESPACE,
    key_type: KEY_TYPE,
    public_key_hex: bytesToHex(publicKey),
    private_key_hex: bytesToHex(privateKey),
    created_at: new Date().toISOString(),
  };
}

/** Path convention: ~/.skillmark/keys/<label>.json */
export function keyPath(keysDir: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(label)) throw new Error(`Invalid key label: ${label}`);
  return join(keysDir, `${label}.json`);
}

function assertKeyMatches(key: SigningKey): void {
  const computed = bytesToHex(ed25519.getPublicKey(hexToBytes(key.private_key_hex)));
  if (computed !== key.public_key_hex) throw new Error("Key file public/private key mismatch");
}

/** Write a key file with mode 0600 (and its directory 0700). */
export function saveKey(key: SigningKey, file: string): void {
  signingKeySchema.parse(key);
  assertKeyMatches(key);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(key, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** Load a key file, refusing any permissions wider than 0600. */
export function loadKey(file: string): SigningKey {
  const stat = statSync(file);
  if (!stat.isFile()) throw new Error(`Key path is not a regular file: ${file}`);
  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `Refusing to load key file with permissions ${mode.toString(8)} (expected 0600): ${file}`,
    );
  }
  const key = signingKeySchema.parse(JSON.parse(readFileSync(file, "utf8")));
  assertKeyMatches(key);
  return key;
}
