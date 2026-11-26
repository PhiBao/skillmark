import { useEffect, useState } from "react";
import { Mark } from "../components/Mark.tsx";
import { Stamp, type StampStatus } from "../components/Stamp.tsx";

interface PublisherKey {
  namespace: string;
  key_type: string;
  public_key_hex: string;
  firstSeen: string;
  ownerAccount: string | null;
  status: string;
  lastUpdated: string | null;
  link: string;
  skills: Array<{ name: string; version: string; manifestHash: string }>;
}
interface PublisherData {
  account: string;
  status: string;
  observedAt: string;
  scope: string;
  keys: PublisherKey[];
  skills: Array<{
    name: string;
    version: string;
    description: string;
    manifestHash: string;
    price: { amountMicroCcd: string; asset: string } | null;
    href: string;
  }>;
  history: Array<{
    name: string;
    version: string;
    manifestHash: string;
    keyHex: string;
    publishedAt: string;
  }>;
  settlements: Array<{
    name: string;
    version: string;
    txHash: string;
    payer: string;
    amountMicroCcd: string;
    link: string;
  }>;
  settlementTotal: number;
  settlementCounts: Array<{ name: string; version: string; count: number }>;
}

function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}
function status(value: string): StampStatus {
  if (value === "verified" || value === "Active") return "verified";
  if (value === "revoked" || value === "Revoked") return "revoked";
  if (value === "registry-mismatch") return "registry-mismatch";
  if (value === "unknown-key") return "unknown-key";
  return "unreachable";
}

export function PublisherView({
  data,
  error = null,
}: {
  data: PublisherData | null;
  error?: string | null;
}) {
  const empty = data !== null && data.keys.length === 0;
  return (
    <>
      <header className="masthead">
        <a className="wordmark" href="/">
          <Mark />
          Skillmark
        </a>
        <a href="/">Recent marks</a>
      </header>
      <main className="sheet">
        <div className="doc-head">
          <div>
            <h1 className="doc-title">Publisher record</h1>
            <div className="doc-version">{data?.account ?? "reading observed keys"}</div>
          </div>
          <Stamp status={error ? "unreachable" : data ? status(data.status) : "checking"} />
        </div>
        {!data && !error ? (
          <p className="state-note">Reading signed releases and CIS-8 on testnet…</p>
        ) : null}
        {!data && error ? <p className="state-note">{error}</p> : null}
        {empty ? <p className="state-note">No signed listings observed for this account.</p> : null}
        {data && !empty ? (
          <>
            <p className="scope-note">
              {data.scope} Observed {data.observedAt}.
            </p>
            <section aria-labelledby="publisher-keys">
              <h2 id="publisher-keys" className="section-label">
                Observed signing keys
              </h2>
              <ol className="ledger">
                {data.keys.map((key) => (
                  <li className="ledger-row resolve" key={key.public_key_hex}>
                    <span className="ledger-label">Signing key</span>
                    <span className="ledger-value">
                      {key.namespace} / {key.key_type}
                      <span className="ledger-detail">{key.public_key_hex}</span>
                      <span className="ledger-detail">
                        first observed {key.firstSeen}
                        {key.lastUpdated ? ` · chain updated ${key.lastUpdated}` : ""}
                      </span>
                    </span>
                    <span>
                      <Stamp status={status(key.status)} />
                      {" · "}
                      <a href={key.link}>chain</a>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-labelledby="publisher-skills">
              <h2 id="publisher-skills" className="section-label">
                Published skills
              </h2>
              <ol className="ledger">
                {data.skills.map((skill) => (
                  <li className="ledger-row" key={`${skill.name}@${skill.version}`}>
                    <span className="ledger-label">{skill.version}</span>
                    <a href={skill.href}>{skill.name}</a>
                    <span>
                      {skill.price
                        ? `${Number(skill.price.amountMicroCcd) / 1e6} ${skill.price.asset}`
                        : "free"}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-labelledby="publisher-history">
              <h2 id="publisher-history" className="section-label">
                Version history
              </h2>
              {data.history.length ? (
                <ol className="ledger">
                  {data.history.map((event) => (
                    <li
                      className="ledger-row"
                      key={`${event.name}-${event.version}-${event.manifestHash}`}
                    >
                      <span className="ledger-label">{event.publishedAt}</span>
                      <span className="ledger-value">
                        {event.name} {event.version}
                        <span className="ledger-detail">{event.manifestHash}</span>
                        <span className="ledger-detail">key {short(event.keyHex)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No release history observed.</p>
              )}
            </section>
            <section aria-labelledby="publisher-settlements">
              <h2 id="publisher-settlements" className="section-label">
                Paid installs
              </h2>
              {data.settlementTotal ? (
                <>
                  <p>
                    {data.settlementTotal} total observed
                    {data.settlements.length < data.settlementTotal
                      ? ` · latest ${data.settlements.length} shown`
                      : ""}
                    .
                  </p>
                  <ol className="ledger">
                    {data.settlements.map((settlement) => (
                      <li className="ledger-row" key={settlement.txHash}>
                        <span className="ledger-label">{settlement.name}</span>
                        <span>
                          {Number(settlement.amountMicroCcd) / 1e6} CCD
                          <span className="ledger-detail">
                            {settlement.version} · from {short(settlement.payer)}
                          </span>
                        </span>
                        <a href={settlement.link}>{short(settlement.txHash)}</a>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p>No paid installs observed.</p>
              )}
            </section>
          </>
        ) : null}
        <section className="limits" aria-label="Limits">
          <h2>Limits</h2>
          <p>
            This record shows keys observed in signed listings, not a reputation score or a complete
            account history.
          </p>
          <p>
            Identity limits damage; it does not prove the skill is safe. The Hermes scanner still
            decides “dangerous”.
          </p>
        </section>
      </main>
    </>
  );
}

export function Publisher({ account }: { account: string }) {
  const [data, setData] = useState<PublisherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/publishers/${encodeURIComponent(account)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Publisher unavailable (HTTP ${response.status}).`);
        return (await response.json()) as PublisherData;
      })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [account]);
  return <PublisherView data={data} error={error} />;
}
