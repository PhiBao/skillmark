import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES, type ProvenanceData, ProvenanceView } from "../src/pages/Provenance.tsx";

const verified: ProvenanceData = {
  name: "invoice-parser",
  version: "1.0.0",
  status: "verified",
  checkedAt: "2026-11-23T09:00:00Z",
  key: { namespace: "skillmark:v1", key_type: "ed25519", public_key_hex: "ab".repeat(32) },
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
  cis8: { index: 12801, subindex: 0 },
  publisherAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
  lines: [
    { label: "Contents", value: "sha256:cf07bf4b…b45d91 · 1234 bytes", check: "ok" },
    { label: "Signed by key", value: "skillmark:v1 / ed25519 / ab12…ef", check: "ok" },
    {
      label: "Key owner",
      value: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
      check: "ok",
    },
    { label: "Key status", value: "Active", check: "ok" },
    { label: "Agent badge", value: "None (human publisher)", check: "unknown" },
    { label: "Paid installs", value: "None", check: "ok" },
  ],
};

const render = (props: Parameters<typeof ProvenanceView>[0]) =>
  renderToStaticMarkup(<ProvenanceView {...props} />);

describe("provenance document", () => {
  it("renders the verified ledger", () => {
    const html = render({ data: verified, loading: false, fixture: null });
    expect(html).toContain("Verified");
    for (const label of [
      "Contents",
      "Signed by key",
      "Key owner",
      "Key status",
      "Agent badge",
      "Paid installs",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Identity limits damage");
    expect(html).toContain("skillmark verify");
  });

  it("links the publisher record, release history and real settlements", () => {
    const html = render({
      data: {
        ...verified,
        settlements: [
          {
            txHash: "12".repeat(32),
            amountMicroCcd: "250000",
            link: `https://ccdexplorer.io/testnet/transaction/${"12".repeat(32)}`,
          },
        ],
        settlementTotal: 1,
      },
      loading: false,
      fixture: null,
      history: [
        {
          name: "invoice-parser",
          version: "1.0.0",
          manifestHash: "sha256:cd",
          keyHex: "ab".repeat(32),
          publishedAt: "2026-11-23T10:00:00Z",
        },
      ],
    });
    expect(html).toContain("Publisher record");
    expect(html).toContain("/p/45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q");
    expect(html).toContain("Version history");
    expect(html).toContain("Settlement history");
    expect(html).toContain("1 total observed");
    expect(html).toContain("0.25 CCD");
    expect(html).toContain("ccdexplorer.io/testnet/transaction/");
  });

  it("uses the actual publisher account in the explorer link", () => {
    const html = render({
      data: {
        ...verified,
        publisherAccount: "4Vrg5rkHN7m2STNTgYAqrxHE1jMAhkeZZ3rfifmtattD9PE5dK",
      },
      loading: false,
      fixture: null,
    });
    expect(html).toContain("/account/4Vrg5rkHN7m2STNTgYAqrxHE1jMAhkeZZ3rfifmtattD9PE5dK");
  });

  it("renders revoked with the quarantine banner", () => {
    const revoked = { ...verified, status: "revoked" as const };
    const html = render({ data: revoked, loading: false, fixture: null });
    expect(html).toContain("Revoked");
    expect(html).toContain("quarantine this skill");
  });

  it("renders the tampered fixture", () => {
    const html = render({ data: null, loading: false, fixture: "tampered" });
    expect(html).toContain("Tampered");
    expect(html).toContain("don&#x27;t match what the author signed");
    expect(html).toContain("Demo fixture");
  });

  it("renders unsigned and unreachable fixtures without claiming verified", () => {
    const unsigned = render({ data: null, loading: false, fixture: "unsigned" });
    expect(unsigned).toContain("Unsigned");
    expect(unsigned).not.toContain(">Verified<");

    const unreachable = render({ data: null, loading: false, fixture: "unreachable" });
    expect(unreachable).toContain("Unreachable");
    expect(unreachable).toContain("Nothing is shown as verified");
    expect(unreachable).not.toContain(">Verified<");
  });

  it("shows a reading state before the chain answers", () => {
    const html = render({ data: null, loading: true, fixture: null });
    expect(html).toContain("Reading CIS-8 on testnet");
    expect(html).toContain("Checking");
  });

  it("keeps the fixture map limited to labelled states", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([
      "revoked",
      "tampered",
      "unreachable",
      "unsigned",
    ]);
  });
});
