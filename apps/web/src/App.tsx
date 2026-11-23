import { Home } from "./pages/Home.tsx";
import { Provenance } from "./pages/Provenance.tsx";

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
  return <Home />;
}

export function App() {
  return <div className="shell">{route()}</div>;
}
