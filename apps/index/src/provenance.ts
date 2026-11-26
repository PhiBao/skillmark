import type { ExternalKey } from "../../../packages/core/src/cis8.js";
import { accountUrl, txUrl } from "../../../packages/core/src/explorer.ts";
import type { SignatureFile } from "../../../packages/core/src/types.ts";
import type { RegistryReader } from "../../../packages/core/src/verifier.js";
import type { ListingRow, Store } from "./store.ts";

export interface ProvenanceLine {
  label: string;
  value: string;
  check: "ok" | "fail" | "unknown";
  detail?: string;
  link?: string;
}

export interface Provenance {
  name: string;
  version: string;
  status: "verified" | "revoked" | "unknown-key" | "registry-mismatch" | "unreachable" | "tampered";
  lines: ProvenanceLine[];
  key: ExternalKey;
  network: string;
  cis8: { index: number; subindex: number };
  publisherAccount: string;
  settlements: Array<{ txHash: string; payer: string; amountMicroCcd: string; link: string }>;
  settlementTotal: number;
  checkedAt: string;
  cached: boolean;
}

interface CacheEntry {
  at: number;
  value: Provenance;
}
const cache = new Map<string, CacheEntry>();
export const CACHE_TTL_MS = 30_000;

export interface ProvenanceDeps {
  store: Store;
  reader: RegistryReader;
  now?: () => number;
}

function clearCache(): void {
  cache.clear();
}

/** Exposed for tests and for publish-time invalidation. */
export { clearCache as clearProvenanceCache };

async function compute(listing: ListingRow, deps: ProvenanceDeps): Promise<Provenance> {
  const sig = JSON.parse(listing.sig) as SignatureFile;
  const key: ExternalKey = {
    namespace: sig.statement.key.namespace,
    key_type: sig.statement.key.key_type,
    public_key_hex: sig.statement.key.public_key_hex,
  };
  const lines: ProvenanceLine[] = [
    {
      label: "Contents",
      value: `${listing.manifestHash} · ${listing.sizeBytes} bytes`,
      check: "ok",
      detail: "sha256 over the canonical manifest of every file",
    },
    {
      label: "Signed by key",
      value: `${key.namespace} / ${key.key_type} / ${key.public_key_hex.slice(0, 8)}…${key.public_key_hex.slice(-4)}`,
      check: "ok",
    },
  ];

  let status: Provenance["status"] = "unreachable";
  try {
    const onChain = await deps.reader.ownerOfKeyOnChain(key);
    if (!onChain.found) {
      lines.push({ label: "Key owner", value: "No active registration", check: "fail" });
      lines.push({ label: "Key status", value: "Not registered / revoked", check: "fail" });
      status = "revoked";
    } else {
      const owner = onChain.ownerAccount ?? "";
      lines.push({
        label: "Key owner",
        value: `${owner} (identity-backed account)`,
        check: "ok",
        link: accountUrl(owner),
      });
      const mcp = await deps.reader.ownerOfKeyMcp(key).catch(() => null);
      const agrees =
        mcp &&
        (mcp.owner ?? "").toLowerCase() === owner.toLowerCase() &&
        mcp.status === onChain.status;
      lines.push({
        label: "Key status",
        value: `${onChain.status}${onChain.lastUpdated ? ` · ${onChain.lastUpdated}` : ""}`,
        check: agrees ? (onChain.status === "Active" ? "ok" : "fail") : "unknown",
        detail: agrees
          ? "direct chain read and Registry MCP agree"
          : "registry mismatch — failing closed",
        link: accountUrl(owner),
      });
      status = agrees
        ? onChain.status === "Active"
          ? "verified"
          : "revoked"
        : "registry-mismatch";

      let badges: string[] = [];
      try {
        const badgeResult = (await deps.reader.checkBadge(owner)) as {
          agents?: Array<{ token_address?: string }>;
        };
        badges = (badgeResult.agents ?? [])
          .map((agent) => agent.token_address ?? "")
          .filter(Boolean);
      } catch {
        badges = [];
      }
      lines.push({
        label: "Agent badge",
        value: badges.length ? badges.join(", ") : "None (human publisher)",
        check: badges.length ? "ok" : "unknown",
      });
    }
  } catch {
    lines.push({ label: "Key owner", value: "Couldn't reach testnet", check: "unknown" });
    lines.push({
      label: "Key status",
      value: "Unreachable — nothing shown as verified",
      check: "unknown",
    });
    status = "unreachable";
  }

  const settlements = deps.store.settlements(listing.name, listing.version);
  const settlementCount = deps.store.settlementCount(listing.name, listing.version);
  lines.push({
    label: "Paid installs",
    value: settlementCount
      ? `${settlementCount} total · latest ${settlements.map((row) => row.txHash.slice(0, 8)).join(", ")}`
      : "None",
    check: "ok",
    detail: settlementCount ? "sponsored fee" : undefined,
  });

  return {
    name: listing.name,
    version: listing.version,
    status,
    lines,
    key,
    network: sig.statement.network,
    cis8: sig.statement.cis8,
    publisherAccount: listing.publisherAccount,
    settlements: settlements.map((row) => ({ ...row, link: txUrl(row.txHash) })),
    settlementTotal: settlementCount,
    checkedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
    cached: false,
  };
}

export async function provenance(
  name: string,
  version: string,
  deps: ProvenanceDeps,
): Promise<Provenance | undefined> {
  const listing = deps.store.getListing(name, version);
  if (!listing) return undefined;
  const key = `${name}@${version}`;
  const now = deps.now?.() ?? Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }
  const value = await compute(listing, deps);
  // Never cache an unreachable result as verified; unreachable itself is fresh information.
  cache.set(key, { at: now, value });
  return value;
}
