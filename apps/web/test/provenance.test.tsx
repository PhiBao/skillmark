import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES, type ProvenanceData, ProvenanceView } from "../src/pages/Provenance.tsx";

const verified: ProvenanceData = {
  name: "invoice-parser",
  version: "1.0.0",
  status: "verified",
  checkedAt: "2026-11-23T09:00:00Z",
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
