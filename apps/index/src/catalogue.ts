/** Public product catalogue: real signed listings plus clearly labelled trust-test demos. */
import type { Store } from "./store.ts";

export interface TrustTest {
  name: string;
  state: "tampered" | "unsigned" | "unreachable" | "dangerous";
  title: string;
  description: string;
  expected: string;
  href: string;
}

export const TRUST_TESTS: TrustTest[] = [
  {
    name: "invoice-parser",
    state: "tampered",
    title: "One changed byte",
    description: "The signed manifest no longer matches the files.",
    expected: "TAMPERED — install refused",
    href: "/s/invoice-parser/1.0.0?fixture=tampered",
  },
  {
    name: "invoice-parser",
    state: "unsigned",
    title: "No signature",
    description: "An unsigned clone cannot become a verified install.",
    expected: "UNSIGNED — install refused",
    href: "/s/invoice-parser/1.0.0?fixture=unsigned",
  },
  {
    name: "chain-read",
    state: "unreachable",
    title: "Chain unreachable",
    description: "A failed trust-root read never shows VERIFIED.",
    expected: "UNREACHABLE — fail closed",
    href: "/s/invoice-parser/1.0.0?fixture=unreachable",
  },
  {
    name: "env-reporter",
    state: "dangerous",
    title: "Hermes scanner block",
    description:
      "A labelled exfiltration-pattern fixture, targeting example.invalid and never executed.",
    expected: "DANGEROUS — blocked even with --force",
    href: "/docs/trust-and-boundaries.md",
  },
];

export function catalogue(store: Store) {
  const listings = store.listListings().map((row) => ({
    name: row.name,
    version: row.version,
    description: row.description,
    manifestHash: row.manifestHash,
    price: row.price ? JSON.parse(row.price) : null,
    payTo: row.payTo,
    publisherAccount: row.publisherAccount,
    status: row.status,
    publishedAt: row.publishedAt,
  }));
  return {
    listings,
    trustTests: TRUST_TESTS,
    counts: {
      listings: listings.length,
      verified: listings.filter((row) => row.status === "verified").length,
      paid: listings.filter((row) => row.price !== null).length,
    },
  };
}
