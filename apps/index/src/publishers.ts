import { accountUrl, txUrl } from "../../../packages/core/src/explorer.ts";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import type { Store } from "./store.ts";

export interface PublisherDeps {
  store: Store;
  reader: RegistryReader;
}

interface ObservedKey {
  namespace: string;
  key_type: string;
  public_key_hex: string;
  firstSeen: string;
  skills: Array<{ name: string; version: string; manifestHash: string }>;
}

function normaliseStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  if (status.toLowerCase() === "active") return "Active";
  if (status.toLowerCase() === "revoked") return "Revoked";
  return status;
}

/** Publisher record built from observed signed releases and live chain state, never reputation scores. */
export async function publisherRecord(account: string, deps: PublisherDeps) {
  const listings = deps.store.listListings().filter((row) => row.publisherAccount === account);
  const history = [...new Set(listings.map((row) => row.name))]
    .flatMap((name) => deps.store.listingHistory(name))
    .filter((event) => event.publisherAccount === account)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const keys = new Map<string, ObservedKey>();

  const observe = (
    key: { namespace?: string; key_type?: string; public_key_hex?: string } | undefined,
    skill: { name: string; version: string; manifestHash: string },
    seenAt: string,
  ) => {
    if (!key?.public_key_hex) return;
    const existing = keys.get(key.public_key_hex);
    if (existing) {
      if (
        !existing.skills.some(
          (item) =>
            item.name === skill.name &&
            item.version === skill.version &&
            item.manifestHash === skill.manifestHash,
        )
      ) {
        existing.skills.push(skill);
      }
      if (seenAt < existing.firstSeen) existing.firstSeen = seenAt;
      return;
    }
    keys.set(key.public_key_hex, {
      namespace: key.namespace ?? "skillmark:v1",
      key_type: key.key_type ?? "ed25519",
      public_key_hex: key.public_key_hex,
      firstSeen: seenAt,
      skills: [skill],
    });
  };

  // Release events retain keys from older versions even after a rotation.
  for (const event of history) {
    observe(
      {
        namespace: event.keyNamespace,
        key_type: event.keyType,
        public_key_hex: event.keyHex,
      },
      { name: event.name, version: event.version, manifestHash: event.manifestHash },
      event.publishedAt,
    );
  }
  // Also support stores created before release events existed.
  for (const row of listings) {
    const sig = JSON.parse(row.sig) as {
      statement?: { key?: { namespace?: string; key_type?: string; public_key_hex?: string } };
    };
    observe(
      sig.statement?.key,
      { name: row.name, version: row.version, manifestHash: row.manifestHash },
      row.publishedAt,
    );
  }

  const observedKeys = await Promise.all(
    [...keys.values()].map(async (key) => {
      try {
        const chain = await deps.reader.ownerOfKeyOnChain(key);
        if (!chain.found) {
          return {
            ...key,
            ownerAccount: chain.ownerAccount,
            status: "Revoked",
            lastUpdated: chain.lastUpdated ?? null,
            link: accountUrl(chain.ownerAccount ?? account),
          };
        }
        const chainStatus = normaliseStatus(chain.status);
        const mcp = await deps.reader.ownerOfKeyMcp(key).catch(() => null);
        const mcpStatus = normaliseStatus(mcp?.status);
        const agrees =
          Boolean(chain.ownerAccount) &&
          chainStatus !== null &&
          (mcp?.owner ?? "").toLowerCase() === (chain.ownerAccount ?? "").toLowerCase() &&
          mcpStatus === chainStatus;
        const known = chainStatus === "Active" || chainStatus === "Revoked";
        return {
          ...key,
          ownerAccount: chain.ownerAccount,
          status: !known ? "unknown-key" : agrees ? chainStatus : "registry-mismatch",
          lastUpdated: chain.lastUpdated ?? null,
          link: accountUrl(chain.ownerAccount ?? account),
        };
      } catch {
        return {
          ...key,
          ownerAccount: null,
          status: "unreachable",
          lastUpdated: null,
          link: accountUrl(account),
        };
      }
    }),
  );

  const settlements = listings
    .flatMap((row) =>
      deps.store.settlements(row.name, row.version).map((settlement) => ({
        ...settlement,
        name: row.name,
        version: row.version,
        link: txUrl(settlement.txHash),
      })),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const statuses = observedKeys.map((key) => key.status);
  const status =
    statuses.length === 0
      ? "unknown-key"
      : statuses.includes("registry-mismatch")
        ? "registry-mismatch"
        : statuses.includes("unreachable")
          ? "unreachable"
          : statuses.includes("unknown-key")
            ? "unknown-key"
            : statuses.includes("Revoked")
              ? "revoked"
              : "verified";

  const settlementCounts = listings.map((row) => ({
    name: row.name,
    version: row.version,
    count: deps.store.settlementCount(row.name, row.version),
  }));

  return {
    account,
    status,
    observedAt: new Date().toISOString(),
    scope: "Keys and releases observed by this index; not a complete account history.",
    keys: observedKeys,
    skills: listings.map((row) => ({
      name: row.name,
      version: row.version,
      description: row.description,
      manifestHash: row.manifestHash,
      price: row.price ? JSON.parse(row.price) : null,
      href: `/s/${row.name}/${row.version}`,
    })),
    history,
    settlements,
    settlementTotal: settlementCounts.reduce((total, row) => total + row.count, 0),
    settlementCounts,
  };
}
