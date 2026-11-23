import { readFileSync } from "node:fs";
import { buildBasicAccountSigner, parseWallet } from "@concordium/web-sdk";
import { CONCORDIUM_TESTNET_CAIP2, toConcordiumFacilitatorSigner } from "@x402/concordium";
import { ExactConcordiumScheme } from "@x402/concordium/exact/facilitator";
import { x402Facilitator } from "@x402/core/facilitator";
import type { Express, Request, Response } from "express";
import { agentsByOwner } from "../../../packages/core/src/registryMcp.ts";
import type { Store } from "./store.ts";

export interface FacilitatorOptions {
  store: Store;
  /** Full wallet export JSON, or a path to one. Never logged. */
  sponsorWalletJson?: string;
  sponsorWalletFile?: string;
}

export interface FacilitatorHandle {
  facilitator: x402Facilitator;
  isAllowedPayTo: (payTo: string) => Promise<boolean>;
}

export function sponsorWallet(options: FacilitatorOptions): {
  address: string;
  signer: ReturnType<typeof buildBasicAccountSigner>;
} {
  const raw =
    options.sponsorWalletJson ??
    (options.sponsorWalletFile ? readFileSync(options.sponsorWalletFile, "utf8") : "");
  if (!raw) throw new Error("Sponsor wallet is not configured");
  const parsed = parseWallet(raw);
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

/** Our own x402 facilitator (D6). payTo must be a verified listing's payee or a CIS-8004 agent wallet. */
export function createFacilitator(options: FacilitatorOptions): FacilitatorHandle {
  const wallet = sponsorWallet(options);
  const facilitator = new x402Facilitator().register(
    CONCORDIUM_TESTNET_CAIP2,
    new ExactConcordiumScheme({
      signer: toConcordiumFacilitatorSigner(wallet.address, wallet.signer, {
        host: "grpc.testnet.concordium.com",
        port: 20_000,
        useTls: true,
        network: CONCORDIUM_TESTNET_CAIP2,
      }),
    }),
  );

  const isAllowedPayTo = async (payTo: string): Promise<boolean> => {
    const listed = options.store
      .listListings()
      .some((row) => row.status === "verified" && row.payTo === payTo);
    if (listed) return true;
    try {
      const agents = await agentsByOwner(payTo);
      return (agents.count ?? agents.agents?.length ?? 0) > 0;
    } catch {
      return false;
    }
  };

  return { facilitator, isAllowedPayTo };
}

const settleWindows = new Map<string, { count: number; resetAt: number }>();
export const SETTLE_LIMIT_PER_MINUTE = 10;

/** Bound sponsor-fee abuse from a single payTo. Testable with an injected clock. */
export function settleAllowed(payTo: string, now = Date.now()): boolean {
  const entry = settleWindows.get(payTo);
  if (!entry || now >= entry.resetAt) {
    settleWindows.set(payTo, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= SETTLE_LIMIT_PER_MINUTE;
}

export function mountFacilitator(app: Express, handle: FacilitatorHandle): void {
  const { facilitator, isAllowedPayTo } = handle;
  app.get("/facilitator/supported", (_req: Request, res: Response) => {
    res.json(facilitator.getSupported());
  });
  app.post("/facilitator/verify", async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const requirements = body.paymentRequirements;
    if (requirements?.payTo && !(await isAllowedPayTo(String(requirements.payTo)))) {
      res.json({
        isValid: false,
        invalidReason: "payTo is not a verified payee or CIS-8004 agent",
      });
      return;
    }
    res.json(await facilitator.verify(body.paymentPayload, requirements));
  });
  app.post("/facilitator/settle", async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const requirements = body.paymentRequirements;
    if (requirements?.payTo && !(await isAllowedPayTo(String(requirements.payTo)))) {
      res.json({ success: false, errorReason: "payTo is not a verified payee or CIS-8004 agent" });
      return;
    }
    if (requirements?.payTo && !settleAllowed(String(requirements.payTo))) {
      res.status(429).json({ success: false, errorReason: "settle rate limit for this payTo" });
      return;
    }
    res.json(await facilitator.settle(body.paymentPayload, requirements));
  });
}
