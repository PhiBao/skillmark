import { useEffect, useState } from "react";
import { Ledger, type LedgerLine } from "../components/Ledger.tsx";
import { Mark } from "../components/Mark.tsx";
import { Stamp, type StampStatus } from "../components/Stamp.tsx";

export interface ProvenanceData {
  name: string;
  version: string;
  status: StampStatus | "unknown-key";
  lines: LedgerLine[];
  checkedAt: string;
}

const BASE_LINES = (manifest: string, keyOwner: string): LedgerLine[] => [
  { label: "Contents", value: manifest, check: "ok" },
  { label: "Signed by key", value: "skillmark:v1 / ed25519 / ab12…ef", check: "ok" },
  { label: "Key owner", value: keyOwner, check: "ok" },
  { label: "Key status", value: "Active", check: "ok" },
  { label: "Agent badge", value: "None (human publisher)", check: "unknown" },
  { label: "Paid installs", value: "None", check: "ok" },
];

/** Labelled demo fixtures for the states that cannot be published to the index. */
export const FIXTURES: Record<string, ProvenanceData> = {
  tampered: {
    name: "invoice-parser",
    version: "1.0.0",
    status: "tampered",
    checkedAt: "2026-11-23T00:00:00Z",
    lines: BASE_LINES("sha256:cf07bf4b…b45d91", "demo fixture").map((line) =>
      line.label === "Contents"
        ? { ...line, check: "fail" as const, detail: "recomputed hash ≠ signed hash" }
        : line,
    ),
  },
  unsigned: {
    name: "invoice-parser",
    version: "1.0.0",
    status: "unsigned",
    checkedAt: "2026-11-23T00:00:00Z",
    lines: BASE_LINES("no signature file", "demo fixture").map((line) => ({
      ...line,
      check: "unknown" as const,
    })),
  },
  revoked: {
    name: "invoice-parser",
    version: "1.0.0",
    status: "revoked",
    checkedAt: "2026-11-23T00:00:00Z",
    lines: BASE_LINES("sha256:cf07bf4b…b45d91", "demo fixture").map((line) =>
      line.label === "Key status"
        ? { ...line, value: "Revoked · 2026-11-23", check: "fail" as const }
        : line,
    ),
  },
  unreachable: {
    name: "invoice-parser",
    version: "1.0.0",
    status: "unreachable",
    checkedAt: "2026-11-23T00:00:00Z",
    lines: BASE_LINES("sha256:cf07bf4b…b45d91", "Couldn't reach testnet").map((line) => ({
      ...line,
      check: "unknown" as const,
    })),
  },
};

interface Props {
  data: ProvenanceData | null;
  loading: boolean;
  error?: string | null;
  fixture?: string | null;
}

export function ProvenanceView({ data, loading, error, fixture }: Props) {
  const fixtureData = fixture ? FIXTURES[fixture] : undefined;
  const view = fixtureData ?? data;
  const status: StampStatus =
    loading && !view ? "checking" : (view?.status ?? (error ? "unreachable" : "checking"));

  return (
    <>
      <header className="masthead">
        <a className="wordmark" href="/">
          <Mark />
          Skillmark
        </a>
        <a href="/docs/trust-and-boundaries.md">Limits</a>
      </header>

      <main className="sheet">
        <div className="doc-head">
          <div>
            <h1 className="doc-title">{view?.name ?? "Skill provenance"}</h1>
            <div className="doc-version">
              {view ? `version ${view.version}` : "reading the ledger"}
            </div>
            {view ? (
              <p className="doc-description">
                A signed record of who made this skill and what they signed.
              </p>
            ) : null}
          </div>
          <Stamp status={status} />
        </div>

        {fixtureData ? (
          <p className="demo-note">Demo fixture — illustrative state, not a live claim.</p>
        ) : null}

        {status === "revoked" ? (
          <div className="banner banner--revoked" role="alert">
            Key revoked on{" "}
            {view?.lines.find((line) => line.label === "Key status")?.value ?? "record"} — agents
            running <code>audit</code> quarantine this skill.
          </div>
        ) : null}
        {status === "tampered" ? (
          <div className="banner banner--tampered" role="alert">
            Contents don&apos;t match what the author signed.
          </div>
        ) : null}
        {status === "unreachable" ? (
          <div className="banner banner--caution" role="alert">
            Couldn&apos;t reach testnet. Nothing is shown as verified.
          </div>
        ) : null}
        {status === "registry-mismatch" ? (
          <div className="banner banner--caution" role="alert">
            Chain read and Registry MCP disagree. Failing closed.
          </div>
        ) : null}
        {status === "unsigned" ? (
          <div className="banner banner--caution" role="alert">
            No signature file. This skill cannot be installed as verified.
          </div>
        ) : null}

        {loading && !view ? (
          <p className="state-note">Reading CIS-8 on testnet… each line resolves on its own.</p>
        ) : null}
        {error && !view ? <p className="state-note">{error}</p> : null}
        {view ? <Ledger lines={view.lines} /> : null}

        {view ? (
          <>
            <section className="verify-block" aria-labelledby="verify-heading">
              <h2 id="verify-heading">Verify it yourself</h2>
              <code className="code">
                npx skillmark verify https://skillmark-index.onrender.com/s/{view.name}/
                {view.version}
              </code>
              <code className="code">registry MCP: owner_of_key {"->"} owner + status</code>
            </section>

            <section className="limits" aria-label="Limits">
              <h2>Limits</h2>
              <p>
                Identity limits damage; it does not prove the skill is safe. The Hermes scanner
                still decides &ldquo;dangerous&rdquo;.
              </p>
              <p>
                Testnet: identities are test identities, not real KYC. Demo publisher and buyers are
                operated by the Skillmark team.
              </p>
            </section>
          </>
        ) : null}
      </main>

      <footer className="footer">
        <a href="https://github.com/PhiBao/skillmark">Repository</a>
        <a href="https://ccdexplorer.io/testnet/account/45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q">
          Publisher account
        </a>
        <span>Testnet only</span>
      </footer>
    </>
  );
}

export function Provenance({
  name,
  version,
  fixture,
}: {
  name: string;
  version: string;
  fixture: string | null;
}) {
  const [data, setData] = useState<ProvenanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/provenance/${encodeURIComponent(name)}/${encodeURIComponent(version)}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "No such skill record."
              : `Provenance unavailable (HTTP ${response.status}).`,
          );
        return (await response.json()) as ProvenanceData;
      })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, version]);

  return <ProvenanceView data={data} loading={loading} error={error} fixture={fixture} />;
}
