import { homedir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import { findBundle } from "./bundles.ts";
import { openStore, type Store } from "./store.ts";
import { buildWellKnownIndex } from "./wellKnown.ts";

export interface AppOptions {
  store: Store;
  dataDir: string;
}

export function createApp({ store, dataDir }: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  const wellKnown = (_req: express.Request, res: express.Response) => {
    res.json(buildWellKnownIndex(store.listListings()));
  };
  app.get("/.well-known/skills/index.json", wellKnown);
  app.get("/.well-known/agent-skills/index.json", wellKnown);

  app.get("/skills/:name/:version/bundle.tgz", (req, res) => {
    const found = findBundle(dataDir, store, req.params.name, req.params.version);
    if (!found) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (found.listing.status !== "verified") {
      res.status(403).json({ error: "listing is not verified" });
      return;
    }
    if (found.listing.price !== null) {
      // Paid bundles are served through the x402 route added in T15.
      res.status(402).json({ error: "payment required" });
      return;
    }
    res.sendFile(found.path);
  });

  app.get("/skills/:name/:version/sig.json", (req, res) => {
    const listing = store.getListing(req.params.name, req.params.version);
    if (!listing) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.type("application/json").send(listing.sig);
  });

  app.get("/api/skills", (_req, res) => {
    res.json(
      store.listListings().map((row) => ({
        name: row.name,
        version: row.version,
        description: row.description,
        manifestHash: row.manifestHash,
        price: row.price ? JSON.parse(row.price) : null,
        payTo: row.payTo,
        status: row.status,
        publishedAt: row.publishedAt,
      })),
    );
  });

  return app;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const port = Number(process.env.PORT ?? 8080);
  const dataDir = process.env.DATA_DIR ?? join(homedir(), ".skillmark", "index");
  const app = createApp({ store: openStore(dataDir), dataDir });
  app.listen(port, () => console.log(`Skillmark index listening on :${port}`));
}
