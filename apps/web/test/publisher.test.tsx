import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublisherView } from "../src/pages/Publisher.tsx";

const account = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";
const data = {
  account,
  status: "verified",
  observedAt: "2026-11-26T00:00:00Z",
  scope: "Keys and releases observed by this index; not a complete account history.",
  keys: [
    {
      namespace: "skillmark:v1",
      key_type: "ed25519",
      public_key_hex: "ab".repeat(32),
      firstSeen: "2026-11-23T10:00:00Z",
      ownerAccount: account,
      status: "Active",
      lastUpdated: "2026-11-26T00:00:00Z",
      link: `https://ccdexplorer.io/testnet/account/${account}`,
      skills: [{ name: "invoice-parser", version: "1.0.0", manifestHash: "sha256:cd" }],
    },
  ],
  skills: [
    {
      name: "invoice-parser",
      version: "1.0.0",
      description: "Parse invoices.",
      manifestHash: "sha256:cd",
      price: null,
      href: "/s/invoice-parser/1.0.0",
    },
  ],
  history: [
    {
      name: "invoice-parser",
      version: "1.0.0",
      manifestHash: "sha256:cd",
      keyHex: "ab".repeat(32),
      publishedAt: "2026-11-23T10:00:00Z",
    },
  ],
  settlements: [
    {
      name: "invoice-parser",
      version: "1.0.0",
      txHash: "12".repeat(32),
      payer: "3mhv",
      amountMicroCcd: "250000",
      link: `https://ccdexplorer.io/testnet/transaction/${"12".repeat(32)}`,
    },
  ],
  settlementTotal: 1,
  settlementCounts: [{ name: "invoice-parser", version: "1.0.0", count: 1 }],
};

describe("publisher record", () => {
  it("shows observed keys, versions, settlements and honest scope", () => {
    const html = renderToStaticMarkup(<PublisherView data={data} />);
    expect(html).toContain("Publisher record");
    expect(html).toContain(">Verified<");
    expect(html).toContain("Observed signing keys");
    expect(html).toContain("Version history");
    expect(html).toContain(`key ${"ab".repeat(32).slice(0, 10)}…${"ab".repeat(32).slice(-6)}`);
    expect(html).toContain("Paid installs");
    expect(html).toContain("1 total observed");
    expect(html).toContain("0.25 CCD");
    expect(html).toContain("not a complete account history");
    expect(html).toContain("ccdexplorer.io/testnet/transaction/");
  });

  it("shows an empty record instead of a verified claim", () => {
    const html = renderToStaticMarkup(
      <PublisherView
        data={{
          ...data,
          status: "unknown-key",
          keys: [],
          skills: [],
          history: [],
          settlements: [],
          settlementTotal: 0,
          settlementCounts: [],
        }}
      />,
    );
    expect(html).toContain("No signed listings observed");
    expect(html).not.toContain(">Verified<");
  });

  it("shows fetch errors instead of an endless reading state", () => {
    const html = renderToStaticMarkup(
      <PublisherView data={null} error="Publisher unavailable (HTTP 503)." />,
    );
    expect(html).toContain("Publisher unavailable (HTTP 503).");
    expect(html).toContain("Unreachable");
    expect(html).not.toContain("Reading signed releases");
  });

  it("shows revoked instead of verified for a revoked key", () => {
    const revoked = {
      ...data,
      status: "revoked",
      keys: [{ ...data.keys[0], status: "Revoked" }],
    };
    const html = renderToStaticMarkup(<PublisherView data={revoked} />);
    expect(html).toContain("Revoked");
    expect(html).not.toContain(">Verified<");
  });
});
