import { useEffect, useState } from "react";
import { Mark } from "../components/Mark.tsx";
import { Stamp, type StampStatus } from "../components/Stamp.tsx";

interface Listing {
  name: string;
  version: string;
  description: string;
  price: { amountMicroCcd: string; asset: string } | null;
  publisherAccount: string;
  status: StampStatus;
}
interface TrustTest {
  name: string;
  state: "tampered" | "unsigned" | "unreachable" | "dangerous";
  title: string;
  description: string;
  expected: string;
  href: string;
}
interface Catalogue {
  listings: Listing[];
  trustTests: TrustTest[];
}

const CLAWHAVOC_SOURCE = "https://cybersecuritynews.com/clawhavoc-poisoned-openclaws-clawhub";

function shortAccount(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
function priceLabel(price: Listing["price"]): string {
  return price ? `${Number(price.amountMicroCcd) / 1e6} ${price.asset}` : "free";
}
function safeStatus(status: string): StampStatus {
  const known: StampStatus[] = [
    "verified",
    "revoked",
    "tampered",
    "unsigned",
    "unknown-key",
    "registry-mismatch",
    "unreachable",
    "dangerous",
    "checking",
  ];
  return known.includes(status as StampStatus) ? (status as StampStatus) : "unknown-key";
}

export function HomeView({
  listings,
  trustTests,
  error,
}: {
  listings: Listing[];
  trustTests: TrustTest[];
  error: string | null;
}) {
  return (
    <>
      <header className="masthead">
        <a className="wordmark" href="/">
          <Mark />
          Skillmark
        </a>
        <a href="#authors">For authors</a>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-headline">
          <h1 className="hero-title" id="hero-headline">
            Accountable skills for Hermes.
          </h1>
          <p className="hero-identity">
            Hermes installs a community skill only if an ID-verified human signed it, pays the
            author on delivery, and pulls it from every agent on the next audit after that
            author&apos;s key is revoked.
          </p>
          <div className="hero-facts">
            <p>
              1,184 malicious skills from 12 accounts reached a public agent marketplace.{" "}
              <a href={CLAWHAVOC_SOURCE} rel="noreferrer">
                ClawHavoc, 2026
              </a>
              .
            </p>
            <p>Hermes trusts four repos. Everyone else is a stranger.</p>
          </div>
          <div className="hero-actions">
            <a className="primary-action" href="/llms.txt">
              Set up in Hermes
            </a>
            <a href="#authors">Publish a skill</a>
          </div>
          <code className="code onboarding-line">
            Read https://skillmark-index.onrender.com/llms.txt and set up Skillmark.
          </code>
        </section>

        <section className="marks" aria-labelledby="marks-heading">
          <h2 id="marks-heading">Recent marks</h2>
          {error ? <p className="state-note">{error}</p> : null}
          {!error && listings.length === 0 ? <p className="state-note">No marks yet.</p> : null}
          <ol className="mark-list">
            {listings.map((listing) => (
              <li className="mark-row" key={`${listing.name}@${listing.version}`}>
                <a className="mark-name" href={`/s/${listing.name}/${listing.version}`}>
                  {listing.name}
                </a>
                <span className="mark-version">v{listing.version}</span>
                <Stamp status={safeStatus(listing.status)} />
                <a className="mark-publisher" href={`/p/${listing.publisherAccount}`}>
                  {shortAccount(listing.publisherAccount)}
                </a>
                <span className="mark-price">{priceLabel(listing.price)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="trust-tests" aria-labelledby="trust-tests-heading">
          <h2 id="trust-tests-heading">Try the trust tests</h2>
          <p>Labelled demos. These are not live claims about a publisher.</p>
          <ol className="trust-test-list">
            {trustTests.map((test) => (
              <li key={`${test.name}-${test.state}`}>
                <a href={test.href}>
                  <span className="trust-test-title">{test.title}</span>
                  <span className="trust-test-description">{test.description}</span>
                  <span className={`trust-test-outcome trust-test-outcome--${test.state}`}>
                    {test.expected}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="authors" id="authors" aria-labelledby="authors-heading">
          <h2 id="authors-heading">For authors</h2>
          <ol className="author-steps">
            <li>
              <span className="step-number">1</span>
              <div>
                <p>Make a signing key and bind it to your verified Concordium account.</p>
                <code className="code">skillmark keygen alice</code>
                <code className="code">skillmark register-key alice</code>
              </div>
            </li>
            <li>
              <span className="step-number">2</span>
              <div>
                <p>Sign the exact contents you will publish.</p>
                <code className="code">skillmark sign ./my-skill --key alice</code>
              </div>
            </li>
            <li>
              <span className="step-number">3</span>
              <div>
                <p>Publish free, or set a price up to 1 CCD and get paid on delivery.</p>
                <code className="code">
                  skillmark publish ./my-skill --price 0.5 --pay-to &lt;account&gt;
                </code>
              </div>
            </li>
          </ol>
        </section>

        <section className="limits" aria-label="Limits">
          <h2>What this does not claim</h2>
          <p>
            Identity limits damage; it does not prove the skill is safe. The Hermes scanner still
            decides &ldquo;dangerous&rdquo;.
          </p>
          <p>
            Testnet: identities are test identities, not real KYC. Demo publisher and buyers are
            operated by the Skillmark team.
          </p>
        </section>
      </main>

      <footer className="footer">
        <a href="https://github.com/PhiBao/skillmark">Repository</a>
        <a href="/llms.txt">Docs</a>
        <a href="https://ccdexplorer.io/testnet/contract/12801/0">CIS-8 contract</a>
        <a href="https://ccdexplorer.io/testnet/contract/12802/0">CIS-8004 contract</a>
        <span>Testnet only</span>
      </footer>
    </>
  );
}

export function Home() {
  const [catalogue, setCatalogue] = useState<Catalogue>({ listings: [], trustTests: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalogue")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Listings unavailable (HTTP ${response.status}).`);
        return (await response.json()) as Catalogue;
      })
      .then((result) => {
        if (!cancelled) setCatalogue(result);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <HomeView listings={catalogue.listings} trustTests={catalogue.trustTests} error={error} />;
}
