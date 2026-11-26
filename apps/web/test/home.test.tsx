import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeView } from "../src/pages/Home.tsx";

const listings = [
  {
    name: "invoice-parser",
    version: "1.0.0",
    description: "Parse invoices.",
    price: null,
    publisherAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "verified" as const,
  },
  {
    name: "skillmark-setup",
    version: "1.0.0",
    description: "Set up Skillmark.",
    price: null,
    publisherAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "verified" as const,
  },
  {
    name: "meeting-notes",
    version: "1.0.0",
    description: "Hermes-made notes.",
    price: { amountMicroCcd: "250000", asset: "CCD" },
    publisherAccount: "4Vrg5rkHN7m2STNTgYAqrxHE1jMAhkeZZ3rfifmtattD9PE5dK",
    status: "verified" as const,
  },
];
const trustTests = [
  {
    name: "invoice-parser",
    state: "tampered" as const,
    title: "One changed byte",
    description: "The signed manifest no longer matches the files.",
    expected: "TAMPERED — install refused",
    href: "/s/invoice-parser/1.0.0?fixture=tampered",
  },
  {
    name: "env-reporter",
    state: "dangerous" as const,
    title: "Hermes scanner block",
    description: "A labelled exfiltration-pattern fixture.",
    expected: "DANGEROUS — blocked even with --force",
    href: "/docs/trust-and-boundaries.md",
  },
];
const render = () =>
  renderToStaticMarkup(<HomeView listings={listings} trustTests={trustTests} error={null} />);

describe("home page", () => {
  it("leads with a short identity and keeps the full product sentence", () => {
    const html = render();
    expect(html).toContain("Accountable skills for Hermes.");
    expect(html).toContain(
      "Hermes installs a community skill only if an ID-verified human signed it",
    );
    expect(html).toContain("1,184 malicious skills from 12 accounts");
    expect(html).toContain("cybersecuritynews.com/clawhavoc");
    expect(html).toContain("Hermes trusts four repos");
  });

  it("shows the one-line Hermes setup path", () => {
    const html = render();
    expect(html).toContain("Set up in Hermes");
    expect(html).toContain("Read https://skillmark-index.onrender.com/llms.txt");
  });

  it("lists the complete live catalogue with stamps, prices and provenance links", () => {
    const html = render();
    expect(html).toContain("invoice-parser");
    expect(html).toContain("skillmark-setup");
    expect(html).toContain("meeting-notes");
    expect(html).toContain("/s/invoice-parser/1.0.0");
    expect(html).toContain("/p/45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q");
    expect(html).toContain("free");
    expect(html).toContain("0.25 CCD");
    expect(html).toContain("45jkbo…Ua5q");
  });

  it("labels trust tests as demos rather than live claims", () => {
    const html = render();
    expect(html).toContain("Try the trust tests");
    expect(html).toContain("Labelled demos");
    expect(html).toContain("TAMPERED — install refused");
    expect(html).toContain("DANGEROUS — blocked even with --force");
  });

  it("shows the three author steps and keeps the D16 limit", () => {
    const html = render();
    expect(html).toContain("skillmark keygen alice");
    expect(html).toContain("skillmark register-key alice");
    expect(html).toContain("skillmark sign ./my-skill --key alice");
    expect(html).toContain("Identity limits damage");
    expect(html).not.toContain("secure");
  });

  it("shows an empty state without listings", () => {
    const html = renderToStaticMarkup(<HomeView listings={[]} trustTests={[]} error={null} />);
    expect(html).toContain("No marks yet.");
  });
});
