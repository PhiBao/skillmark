import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ListingRow, Store } from "./store.ts";

export function bundleFilename(bundleSha256: string): string {
  const hex = bundleSha256.replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("Invalid bundle sha256");
  return `${hex}.tgz`;
}

export function bundlePath(dataDir: string, listing: ListingRow): string {
  return join(dataDir, "bundles", bundleFilename(listing.bundleSha256));
}

export function findBundle(
  dataDir: string,
  store: Store,
  name: string,
  version: string,
): { listing: ListingRow; path: string } | undefined {
  const listing = store.getListing(name, version);
  if (!listing) return undefined;
  const path = bundlePath(dataDir, listing);
  if (!existsSync(path)) return undefined;
  return { listing, path };
}
