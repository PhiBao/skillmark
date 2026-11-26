import { Home } from "./pages/Home.tsx";
import { Provenance } from "./pages/Provenance.tsx";
import { Publisher } from "./pages/Publisher.tsx";

function route() {
  const path = window.location.pathname;
  const match = /^\/s\/([^/]+)\/([^/]+)\/?$/.exec(path);
  if (match) {
    const fixture = new URLSearchParams(window.location.search).get("fixture");
    return (
      <Provenance
        name={decodeURIComponent(match[1])}
        version={decodeURIComponent(match[2])}
        fixture={fixture}
      />
    );
  }
  const publisher = /^\/p\/([^/]+)\/?$/.exec(path);
  if (publisher) return <Publisher account={decodeURIComponent(publisher[1])} />;
  return <Home />;
}

export function App() {
  return <div className="shell">{route()}</div>;
}
