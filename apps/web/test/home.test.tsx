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
    name: "meeting-notes",
    version: "1.0.0",
    description: "Hermes-made notes.",
    price: { amountMicroCcd: "250000", asset: "CCD" },
    publisherAccount: "4Vrg5rkHN7m2STNTgYAqrxHE1jMAhkeZZ3rfifmtattD9PE5dK",
    status: "verified" as const,
  },
];

describe("home page", () => {
  it("states the one-sentence identity and the ClawHavoc source", () => {
    const html = renderToStaticMarkup(<HomeView listings={listings} error={null} />);
    expect(html).toContain(
      "Hermes installs a community skill only if an ID-verified human signed it",
    );
    expect(html).toContain("1,184 malicious skills from 12 accounts");
    expect(html).toContain("cybersecuritynews.com/clawhavoc");
    expect(html).toContain("Hermes trusts four repos");
  });

  it("lists live marks with stamps, prices and provenance links", () => {
    const html = renderToStaticMarkup(<HomeView listings={listings} error={null} />);
    expect(html).toContain("invoice-parser");
    expect(html).toContain("meeting-notes");
    expect(html).toContain("/s/invoice-parser/1.0.0");
    expect(html).toContain("free");
    expect(html).toContain("0.25 CCD");
    expect(html).toContain("45jkbo…Ua5q");
  });

  it("shows the three author steps and keeps the D16 limit", () => {
    const html = renderToStaticMarkup(<HomeView listings={listings} error={null} />);
    expect(html).toContain("skillmark keygen alice");
    expect(html).toContain("skillmark register-key alice");
    expect(html).toContain("skillmark sign ./my-skill --key alice");
    expect(html).toContain("Identity limits damage");
    expect(html).not.toContain("secure");
  });

  it("shows an empty state without listings", () => {
    const html = renderToStaticMarkup(<HomeView listings={[]} error={null} />);
    expect(html).toContain("No marks yet.");
  });
});
