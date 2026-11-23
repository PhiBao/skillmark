import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

/** RFC 8785 JSON Canonicalization Scheme. */
export function jcs(value: unknown): string {
  const output = canonicalize(value);
  if (output === undefined) {
    throw new Error("Value cannot be serialised with JCS");
  }
  return output;
}

/** SHA-256 over bytes, rendered as lowercase hex. */
export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Manifest hash is sha256(JCS(manifest)), rendered `sha256:<hex>`. */
export function hashManifest(manifest: unknown): string {
  return `sha256:${sha256Hex(Buffer.from(jcs(manifest), "utf8"))}`;
}
