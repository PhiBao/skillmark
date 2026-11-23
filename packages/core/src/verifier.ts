import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hashManifest } from "./canonical.js";
import type { ExternalKey } from "./cis8.js";
import { loadConfig, type NetworkConfig } from "./config.js";
import { buildManifest } from "./manifest.js";
import { verifyStatement } from "./signature.js";
import { SIGNATURE_FILE, type SignatureFile } from "./types.js";

export type VerifyResult =
  | "unsigned"
  | "invalid"
  | "tampered"
  | "wrong-registry"
  | "revoked"
  | "unknown-key"
  | "registry-mismatch"
  | "verified";

export interface PriorRecord {
  key: ExternalKey;
  result?: string;
  manifestHash?: string;
  [field: string]: unknown;
}

export interface OwnerOfKeyView {
  found: boolean;
  ownerAccount: string | null;
  status: string | null;
  lastUpdated?: string | null;
}

/** Injected so tests can use fixtures and the real implementation uses chain + MCP. */
export interface RegistryReader {
  ownerOfKeyOnChain(key: ExternalKey): Promise<OwnerOfKeyView>;
  ownerOfKeyMcp(key: ExternalKey): Promise<{ owner?: string; status?: string } | null>;
  checkBadge(owner: string): Promise<unknown>;
}

export interface VerifyOptions {
  registryReader: RegistryReader;
  priorRecords?: PriorRecord[];
  config?: NetworkConfig;
}

export interface Verification {
  result: VerifyResult;
  reasons: string[];
  owner_account?: string;
  key: ExternalKey;
  manifestHash: string | null;
  checkedAt: string;
  last_updated?: string | null;
  badges?: string[];
}

function finish(
  result: VerifyResult,
  reasons: string[],
  key: ExternalKey,
  manifestHash: string | null,
): Verification {
  return { result, reasons, key, manifestHash, checkedAt: new Date().toISOString() };
}

function sameKey(a: ExternalKey, b: ExternalKey): boolean {
  return (
    a.namespace === b.namespace &&
    a.key_type === b.key_type &&
    a.public_key_hex.toLowerCase() === b.public_key_hex.toLowerCase()
  );
}

function normaliseStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === "active") return "Active";
  if (lower === "revoked") return "Revoked";
  return lower;
}

function badgesFrom(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const agents = (value as { agents?: unknown }).agents;
  if (!Array.isArray(agents)) return [];
  return agents
    .map((agent) => (agent as { token_address?: unknown })?.token_address)
    .filter((address): address is string => typeof address === "string");
}

/** Apply the A§4.6 decision table in order. Never returns `verified` on a chain error. */
export async function verifySkill(dir: string, options: VerifyOptions): Promise<Verification> {
  const config = options.config ?? loadConfig();
  const sigPath = join(dir, SIGNATURE_FILE);

  // Row 1 — no signature file.
  if (!existsSync(sigPath)) {
    return finish(
      "unsigned",
      ["no-signature-file"],
      { namespace: "", key_type: "", public_key_hex: "" },
      null,
    );
  }

  let sig: SignatureFile;
  try {
    sig = JSON.parse(readFileSync(sigPath, "utf8")) as SignatureFile;
  } catch {
    return finish(
      "unsigned",
      ["unreadable-signature-file"],
      { namespace: "", key_type: "", public_key_hex: "" },
      null,
    );
  }
  const key: ExternalKey = {
    namespace: sig.statement?.key?.namespace ?? "",
    key_type: sig.statement?.key?.key_type ?? "",
    public_key_hex: sig.statement?.key?.public_key_hex ?? "",
  };
  const statementHash = sig.statement?.manifestHash ?? null;

  // Row 2 — manifest/path rules.
  let built: Awaited<ReturnType<typeof buildManifest>>;
  try {
    built = await buildManifest(dir);
  } catch (error) {
    return finish("invalid", [`manifest-invalid: ${(error as Error).message}`], key, statementHash);
  }

  // Row 3 — hash or identity mismatch.
  const recomputed = hashManifest(built.manifest);
  if (
    recomputed !== statementHash ||
    built.manifest.name !== sig.statement?.name ||
    built.manifest.version !== sig.statement?.version
  ) {
    return finish("tampered", ["manifest-mismatch"], key, statementHash);
  }

  // Row 4 — bad signature.
  if (!verifyStatement(sig)) {
    return finish("tampered", ["invalid-signature"], key, statementHash);
  }

  // Row 5 — wrong network or registry contract.
  if (
    sig.statement.network !== config.caip2 ||
    sig.statement.cis8?.index !== config.cis8.index ||
    sig.statement.cis8?.subindex !== config.cis8.subindex
  ) {
    return finish("wrong-registry", ["statement-network-or-contract-mismatch"], key, statementHash);
  }

  // Chain read — fail closed on any error.
  let onChain: OwnerOfKeyView;
  try {
    onChain = await options.registryReader.ownerOfKeyOnChain(key);
  } catch (error) {
    return finish(
      "unknown-key",
      [`chain-unreachable: ${(error as Error).message}`],
      key,
      statementHash,
    );
  }

  // Row 6 — chain says revoked.
  if (onChain.found && normaliseStatus(onChain.status) === "Revoked") {
    return finish("revoked", ["key-revoked-on-chain"], key, statementHash);
  }

  // Rows 7 and 8 — no active registration.
  if (!onChain.found) {
    const hadVerified = (options.priorRecords ?? []).some(
      (record) => record.result === "verified" && sameKey(record.key, key),
    );
    return hadVerified
      ? finish("revoked", ["key-absent-but-was-previously-verified"], key, statementHash)
      : finish("unknown-key", ["no-active-registration"], key, statementHash);
  }

  // Row 9 — cross-check with the Registry MCP; disagreement fails closed.
  let mcp: { owner?: string; status?: string } | null;
  try {
    mcp = await options.registryReader.ownerOfKeyMcp(key);
  } catch {
    mcp = null;
  }
  const chainStatus = normaliseStatus(onChain.status);
  const mcpStatus = normaliseStatus(mcp?.status);
  if (
    !mcp ||
    (mcp.owner ?? "").toLowerCase() !== (onChain.ownerAccount ?? "").toLowerCase() ||
    mcpStatus !== chainStatus
  ) {
    return finish("registry-mismatch", ["chain-and-registry-mcp-disagree"], key, statementHash);
  }

  // Row 10 — verified, plus badge lines from check_badge on the owner account.
  let badges: string[] = [];
  try {
    badges = badgesFrom(await options.registryReader.checkBadge(onChain.ownerAccount ?? ""));
  } catch {
    badges = [];
  }
  return {
    result: "verified",
    reasons: ["active-key", "registry-mcp-agrees"],
    owner_account: onChain.ownerAccount ?? undefined,
    key,
    manifestHash: statementHash,
    checkedAt: new Date().toISOString(),
    last_updated: onChain.lastUpdated ?? null,
    badges,
  };
}
