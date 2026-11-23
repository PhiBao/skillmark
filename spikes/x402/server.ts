/**
 * T02 spike A: in-process x402 facilitator + resource server on Concordium testnet.
 * The facilitator is our own (not the public one). Keys are read from ~/.skillmark and never printed.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildBasicAccountSigner, parseWallet } from "@concordium/web-sdk";
import { CONCORDIUM_TESTNET_CAIP2, toConcordiumFacilitatorSigner } from "@x402/concordium";
import { ExactConcordiumScheme as FacilitatorScheme } from "@x402/concordium/exact/facilitator";
import { ExactConcordiumScheme as ServerScheme } from "@x402/concordium/exact/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/express";
import express from "express";

const PORT = Number(process.env.SPIKE_X402_PORT ?? 4020);
const NETWORK = CONCORDIUM_TESTNET_CAIP2;
const PRICE = { amount: "100000", asset: "CCD" }; // 0.1 CCD

function wallet(label: string) {
  const file = join(homedir(), ".skillmark", "wallets", `${label}.export`);
  const parsed = parseWallet(readFileSync(file, "utf8"));
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

const sponsor = wallet("sponsor");
const alice = wallet("alice");

const facilitator = new x402Facilitator().register(
  NETWORK,
  new FacilitatorScheme({
    signer: toConcordiumFacilitatorSigner(sponsor.address, sponsor.signer, {
      host: "grpc.testnet.concordium.com",
      port: 20000,
      useTls: true,
      network: NETWORK,
    }),
  }),
);

const facilitatorUrl = `http://127.0.0.1:${PORT}/facilitator`;
const resourceServer = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: facilitatorUrl }),
).register(NETWORK, new ServerScheme());

const routes = {
  "GET /ok": {
    accepts: { scheme: "exact" as const, network: NETWORK, payTo: alice.address, price: PRICE },
    description: "T02 spike: returns 200 after a 20s delay so settlement happens on delivery.",
  },
  "GET /fail": {
    accepts: { scheme: "exact" as const, network: NETWORK, payTo: alice.address, price: PRICE },
    description: "T02 spike: always returns 422, so no settlement may occur.",
  },
};

const app = express();
app.use(express.json());
let ready = false;

app.get("/healthz", (_req, res) => {
  res.status(ready ? 200 : 503).json({ ready });
});

app.get("/facilitator/supported", (_req, res) => {
  res.json(facilitator.getSupported());
});
app.post("/facilitator/verify", async (req, res) => {
  const body = req.body ?? {};
  res.json(await facilitator.verify(body.paymentPayload, body.paymentRequirements));
});
app.post("/facilitator/settle", async (req, res) => {
  const body = req.body ?? {};
  res.json(await facilitator.settle(body.paymentPayload, body.paymentRequirements));
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const listener = app.listen(PORT, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  listener.once("listening", resolve);
  listener.once("error", reject);
});
// The resource server fetches /facilitator/supported over HTTP, so the listener must be up first.
await resourceServer.initialize();
// Registered only after the listener is up: the middleware's own HTTP-wrapper init fetches
// /facilitator/supported over HTTP at app.use time and would otherwise hit ECONNREFUSED.
app.use(paymentMiddleware(routes, resourceServer));
// Protected handlers come after the middleware so every request passes through it.
app.get("/ok", async (_req, res) => {
  await sleep(20_000);
  res.json({ ok: true });
});
app.get("/fail", (_req, res) => {
  res.status(422).json({ error: "forced failure — no settlement expected" });
});
ready = true;
console.log(`T02 x402 spike ready on http://127.0.0.1:${PORT} (facilitator ${facilitatorUrl})`);
