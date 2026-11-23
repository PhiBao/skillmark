import { readFileSync } from "node:fs";
import { CONCORDIUM_TESTNET_CAIP2 } from "@x402/concordium";
import { ExactConcordiumScheme } from "@x402/concordium/exact/server";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/express";
import type { Express, NextFunction, Request, Response } from "express";
import { bundlePath } from "./bundles.ts";
import type { Store } from "./store.ts";

export interface PaidOptions {
  store: Store;
  dataDir: string;
  facilitatorUrl: string;
}

type Middleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * x402-paid bundle route. The route config is built per listing (so requirements.extra
 * carries the signed manifestHash) and cached. Free bundles fall through to the plain route.
 */
export function mountPaidBundles(app: Express, options: PaidOptions): void {
  const resourceServer = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: options.facilitatorUrl }),
  ).register(CONCORDIUM_TESTNET_CAIP2, new ExactConcordiumScheme());
  const cache = new Map<string, Middleware>();

  app.get(
    "/skills/:name/:version/bundle.tgz",
    async (req: Request, res: Response, next: NextFunction) => {
      const listing = options.store.getListing(String(req.params.name), String(req.params.version));
      if (!listing || listing.price === null) {
        next();
        return;
      }
      if (listing.status !== "verified") {
        res.status(403).json({ error: "listing is not verified" });
        return;
      }
      const payTo = listing.payTo;
      if (!payTo) {
        res.status(500).json({ error: "paid listing has no payTo" });
        return;
      }
      const price = JSON.parse(listing.price) as { amountMicroCcd: string; asset: string };

      const key = `${listing.name}@${listing.version}@${listing.bundleSha256}`;
      let middleware = cache.get(key);
      if (!middleware) {
        middleware = paymentMiddleware(
          {
            [`GET /skills/${listing.name}/${listing.version}/bundle.tgz`]: {
              accepts: {
                scheme: "exact",
                network: CONCORDIUM_TESTNET_CAIP2,
                payTo,
                price: { amount: price.amountMicroCcd, asset: price.asset },
                extra: { manifestHash: listing.manifestHash },
              },
              description: listing.description,
              mimeType: "application/gzip",
            },
          },
          resourceServer,
        ) as unknown as Middleware;
        cache.set(key, middleware);
      }

      await middleware(req, res, () => {
        // Read the whole bundle before responding: a read error must yield >=400 so x402 does not settle.
        let bytes: Buffer;
        try {
          bytes = readFileSync(bundlePath(options.dataDir, listing));
        } catch {
          res.status(500).json({ error: "bundle unreadable" });
          return;
        }
        res.on("finish", () => {
          const header = res.getHeader("payment-response");
          if (!header) return;
          try {
            const settlement = decodePaymentResponseHeader(String(header));
            if (settlement.success) {
              options.store.addSettlement({
                name: listing.name,
                version: listing.version,
                txHash: settlement.transaction,
                payer: settlement.payer ?? "",
                amountMicroCcd: price.amountMicroCcd,
              });
            }
          } catch {
            // A malformed receipt must not break the response already sent.
          }
        });
        res.type("application/gzip").send(bytes);
      });
    },
  );
}
