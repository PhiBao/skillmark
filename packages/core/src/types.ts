/** Shared, serialisable types for the Skillmark core package. */

export const MANIFEST_SCHEMA = "skillmark/manifest/v1";
export const STATEMENT_SCHEMA = "skillmark/statement/v1";
export const SIG_SCHEMA = "skillmark/sig/v1";
export const SIGNATURE_FILE = "skillmark.sig.json";

/** Skill names follow agentskills.io: lowercase alphanumeric, single hyphens, 1–64 chars. */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ManifestFile {
  path: string;
  sha256: string;
  size: number;
}

export interface Manifest {
  schema: typeof MANIFEST_SCHEMA;
  name: string;
  version: string;
  files: ManifestFile[];
}

export interface Frontmatter {
  name?: string;
  description?: string;
  version?: string;
}

export interface Cis8Ref {
  index: number;
  subindex: number;
}

export interface SigningKeyRef {
  namespace: string;
  key_type: string;
  public_key_hex: string;
}

export interface Statement {
  schema: typeof STATEMENT_SCHEMA;
  manifestHash: string;
  name: string;
  version: string;
  network: string;
  cis8: Cis8Ref;
  key: SigningKeyRef;
  issuedAt: string;
}

export interface SignatureFile {
  schema: typeof SIG_SCHEMA;
  statement: Statement;
  signature_hex: string;
}
