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

const CLAWHAVOC_SOURCE = "https://cybersecuritynews.com/clawhavoc-poisoned-openclaws-clawhub";

function shortAccount(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function priceLabel(price: Listing["price"]): string {
  return price ? `${Number(price.amountMicroCcd) / 1e6} ${price.asset}` : "free";
}

export function HomeView({ listings, error }: { listings: Listing[]; error: string | null }) {
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
            Hermes installs a community skill only if an ID-verified human signed it, pays the
            author on delivery, and pulls it from every agent the moment that author&apos;s key is
            revoked.
          </h1>
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
                <Stamp status={listing.status} />
                <span className="mark-publisher">{shortAccount(listing.publisherAccount)}</span>
                <span className="mark-price">{priceLabel(listing.price)}</span>
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
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Listings unavailable (HTTP ${response.status}).`);
        return (await response.json()) as Listing[];
      })
      .then((result) => {
        if (!cancelled) setListings(result);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <HomeView listings={listings} error={error} />;
}
