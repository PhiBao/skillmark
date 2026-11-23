import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type ProvenanceData, ProvenanceView } from "../src/pages/Provenance.tsx";

const base: ProvenanceData = {
  name: "invoice-parser",
  version: "1.0.0",
  status: "verified",
  checkedAt: "2026-11-23T10:00:00Z",
  lines: [
    { label: "Contents", value: "sha256:…", check: "ok" },
    { label: "Key owner", value: "45jkbo…", check: "ok" },
    { label: "Key status", value: "Active", check: "ok" },
  ],
};

const badStatuses: Array<ProvenanceData["status"]> = [
  "revoked",
  "tampered",
  "unsigned",
  "unreachable",
  "registry-mismatch",
];

describe("the provenance page never shows VERIFIED for an unproven skill", () => {
  for (const status of badStatuses) {
    it(`${status} never renders the verified stamp`, () => {
      const html = renderToStaticMarkup(
        <ProvenanceView data={{ ...base, status }} loading={false} fixture={null} />,
      );
      expect(html).not.toContain(">Verified<");
      expect(html).toContain("Limits");
    });
  }
});
