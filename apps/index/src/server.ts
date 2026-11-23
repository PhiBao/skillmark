import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { ownerOfKeyOnChain } from "../../../packages/core/src/cis8.ts";
import { findRepoRoot } from "../../../packages/core/src/config.ts";
import { checkBadge, ownerOfKeyMcp } from "../../../packages/core/src/registryMcp.ts";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import { mountAgentCard } from "./agentCard.ts";
import { findBundle } from "./bundles.ts";
import { createFacilitator, mountFacilitator } from "./facilitator.ts";
import { mountPaidBundles } from "./payments.ts";
import { provenance } from "./provenance.ts";
import { registerPublish } from "./publish.ts";
import { openStore, type Store } from "./store.ts";
import { buildWellKnownIndex } from "./wellKnown.ts";

export interface AppOptions {
  store: Store;
  dataDir: string;
  registryReader?: RegistryReader;
  rateLimitPerHour?: number;
  facilitatorUrl?: string;
  facilitator?: ReturnType<typeof createFacilitator>;
}

export function createApp({
  store,
  dataDir,
  registryReader,
  rateLimitPerHour,
  facilitatorUrl,
  facilitator,
}: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  mountAgentCard(app, findRepoRoot(fileURLToPath(new URL(".", import.meta.url))));

  if (facilitator) mountFacilitator(app, facilitator);
  if (facilitatorUrl) mountPaidBundles(app, { store, dataDir, facilitatorUrl });

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

  if (registryReader) {
    registerPublish(app, { store, dataDir, registryReader, rateLimitPerHour });
  }

  if (registryReader) {
    app.get("/api/provenance/:name/:version", async (req, res) => {
      const result = await provenance(String(req.params.name), String(req.params.version), {
        store,
        reader: registryReader,
      });
      if (!result) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.json(result);
    });
  }

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

  // Built web app (T22+). Vite output is served at the root; /s/* falls back to index.html.
  const webDist = join(
    findRepoRoot(fileURLToPath(new URL(".", import.meta.url))),
    "apps",
    "web",
    "dist",
  );
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^\/s\/.+$/, (_req, res) => {
      res.sendFile(join(webDist, "index.html"));
    });
  }

  return app;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const port = Number(process.env.PORT ?? 8080);
  const dataDir = process.env.DATA_DIR ?? join(homedir(), ".skillmark", "index");
  const registryReader: RegistryReader = {
    ownerOfKeyOnChain: (key) => ownerOfKeyOnChain(key),
    ownerOfKeyMcp: async (key) =>
      (await ownerOfKeyMcp(key)) as { owner?: string; status?: string } | null,
    checkBadge: (owner) => checkBadge(owner),
  };
  const store = openStore(dataDir);
  const sponsorWalletJson = process.env.SPONSOR_WALLET_JSON;
  const sponsorWalletFile =
    process.env.SPONSOR_WALLET_FILE ?? join(homedir(), ".skillmark", "wallets", "sponsor.export");
  const facilitator = createFacilitator({
    store,
    sponsorWalletJson,
    sponsorWalletFile: sponsorWalletJson ? undefined : sponsorWalletFile,
  });
  const app = createApp({
    store,
    dataDir,
    registryReader,
    facilitator,
    facilitatorUrl: `http://127.0.0.1:${port}/facilitator`,
  });
  const { seedIndex } = await import("../../../scripts/seed-index.ts");
  await seedIndex(store, findRepoRoot(fileURLToPath(new URL(".", import.meta.url))), dataDir);
  app.listen(port, () => console.log(`Skillmark index listening on :${port}`));
}
