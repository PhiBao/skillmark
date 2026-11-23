import type { ListingRow } from "./store.ts";

export const DISCOVERY_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

export interface WellKnownSkill {
  name: string;
  type: "archive";
  description: string;
  url: string;
  digest: string;
  files: string[];
  skillmark: {
    manifestHash: string;
    price: { amountMicroCcd: string; asset: "CCD" } | null;
    provenance: string;
  };
}

export interface WellKnownIndex {
  $schema: string;
  skills: WellKnownSkill[];
}

/**
 * Public well-known index. Only free listings appear (D18): native Hermes cannot
 * perform x402, so paid skills are installed through the MCP instead.
 */
export function buildWellKnownIndex(listings: ListingRow[]): WellKnownIndex {
  return {
    $schema: DISCOVERY_SCHEMA,
    skills: listings
      .filter((listing) => listing.status === "verified" && listing.price === null)
      .map((listing) => ({
        name: listing.name,
        type: "archive" as const,
        description: listing.description,
        url: `/skills/${listing.name}/${listing.version}/bundle.tgz`,
        digest: listing.bundleSha256,
        files: ["SKILL.md"],
        skillmark: {
          manifestHash: listing.manifestHash,
          price: null,
          provenance: `/s/${listing.name}/${listing.version}`,
        },
      })),
  };
}
