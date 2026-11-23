import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { jcs } from "./canonical.js";
import { loadConfig, type NetworkConfig } from "./config.js";
import { KEY_TYPE, type SigningKey, SKILLMARK_NAMESPACE } from "./keys.js";
import {
  type Cis8Ref,
  SIG_SCHEMA,
  type SignatureFile,
  STATEMENT_SCHEMA,
  type Statement,
} from "./types.js";

/** Domain tag: prevents a statement signature from being reused as a CIS-8 proof. */
export const SIGN_DOMAIN = "skillmark/v1/statement\n";

/** Exact signed bytes from A§4.3: UTF-8 domain tag followed by UTF-8 JCS(statement). */
export function signedBytes(statement: Statement): Uint8Array {
  return Buffer.concat([Buffer.from(SIGN_DOMAIN, "utf8"), Buffer.from(jcs(statement), "utf8")]);
}

interface BuildStatementInput {
  manifestHash: string;
  name: string;
  version: string;
  key: SigningKey;
  network?: string;
  cis8?: Cis8Ref;
  issuedAt?: string;
}

/** Build a statement, defaulting network and contract to the validated testnet config. */
export function buildStatement(
  input: BuildStatementInput,
  config: NetworkConfig = loadConfig(),
): Statement {
  return {
    schema: STATEMENT_SCHEMA,
    manifestHash: input.manifestHash,
    name: input.name,
    version: input.version,
    network: input.network ?? config.caip2,
    cis8: input.cis8 ?? { index: config.cis8.index, subindex: config.cis8.subindex },
    key: {
      namespace: SKILLMARK_NAMESPACE,
      key_type: KEY_TYPE,
      public_key_hex: input.key.public_key_hex,
    },
    issuedAt: input.issuedAt ?? new Date().toISOString(),
  };
}

/** Sign a statement with an ed25519 key. */
export function signStatement(statement: Statement, key: SigningKey): SignatureFile {
  if (statement.schema !== STATEMENT_SCHEMA) throw new Error("Unsupported statement schema");
  if (statement.key.public_key_hex !== key.public_key_hex)
    throw new Error("Statement key does not match signing key");
  const signature = ed25519.sign(signedBytes(statement), hexToBytes(key.private_key_hex));
  return {
    schema: SIG_SCHEMA,
    statement,
    signature_hex: bytesToHex(signature),
  };
}

/** Verify a signature file's shape and ed25519 signature. Never throws for bad input. */
export function verifyStatement(sig: unknown): boolean {
  try {
    if (typeof sig !== "object" || sig === null) return false;
    const file = sig as Partial<SignatureFile>;
    if (file.schema !== SIG_SCHEMA) return false;
    const statement = file.statement;
    if (!statement || statement.schema !== STATEMENT_SCHEMA) return false;
    if (typeof file.signature_hex !== "string" || !/^[0-9a-f]{128}$/.test(file.signature_hex))
      return false;
    if (statement.key?.namespace !== SKILLMARK_NAMESPACE || statement.key?.key_type !== KEY_TYPE)
      return false;
    if (!/^[0-9a-f]{64}$/.test(statement.key.public_key_hex)) return false;
    return ed25519.verify(
      hexToBytes(file.signature_hex),
      signedBytes(statement),
      hexToBytes(statement.key.public_key_hex),
    );
  } catch {
    return false;
  }
}
