import { Mark } from "../components/Mark.tsx";

/** T23 fills the home page. This placeholder keeps the route working during T22. */
export function Home() {
  return (
    <>
      <header className="masthead">
        <a className="wordmark" href="/">
          <Mark />
          Skillmark
        </a>
      </header>
      <main className="sheet">
        <div className="doc-head">
          <div>
            <h1 className="doc-title">Accountable skills for Hermes.</h1>
            <p className="doc-description">Home page is added in T23.</p>
          </div>
        </div>
      </main>
    </>
  );
}
