/**
 * T02 spike A client: pays for /ok (settlement expected) and /fail (none expected).
 * Prints only public data: addresses, tx hash, balances, timings. Never prints keys.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AccountAddress,
  buildBasicAccountSigner,
  CcdAmount,
  parseWallet,
} from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import { CONCORDIUM_TESTNET_CAIP2 } from "@x402/concordium";
import { ExactConcordiumScheme } from "@x402/concordium/exact/client";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPayment } from "@x402/fetch";

const BASE =
  process.env.SPIKE_X402_URL ?? `http://127.0.0.1:${process.env.SPIKE_X402_PORT ?? 4020}`;
const NETWORK = CONCORDIUM_TESTNET_CAIP2;
const mode = process.argv[2] ?? "ok";
if (mode !== "ok" && mode !== "fail") throw new Error("usage: client.ts ok|fail");

function wallet(label: string) {
  const file = join(homedir(), ".skillmark", "wallets", `${label}.export`);
  const parsed = parseWallet(readFileSync(file, "utf8"));
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

const payer = wallet("hermes");
const payee = wallet("alice");
const grpc = new ConcordiumGRPCNodeClient(
  "grpc.testnet.concordium.com",
  20000,
  credentials.createSsl(),
);

async function nonceOf(address: string): Promise<bigint> {
  const nonce = await grpc.getNextAccountNonce(AccountAddress.fromBase58(address));
  return BigInt(nonce.nonce.toString());
}
async function balanceOf(address: string): Promise<bigint> {
  const info = await grpc.getAccountInfo(AccountAddress.fromBase58(address));
  return BigInt(CcdAmount.toMicroCcd(info.accountAmount).toString());
}

const client = new x402Client()
  .register(
    "ccd:*",
    new ExactConcordiumScheme({
      accountAddress: AccountAddress.fromBase58(payer.address),
      signer: payer.signer,
    }),
  )
  // CCD is not a "default" asset in x402 spend controls; it must be explicitly allowed.
  .setSpendControls({
    allowedAssets: [{ network: NETWORK, asset: "CCD", maxAmountPerPayment: "1000000" }],
  });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const payerNonceBefore = await nonceOf(payer.address);
const payeeBalanceBefore = await balanceOf(payee.address);
const started = Date.now();
const response = await fetchWithPayment(`${BASE}/${mode}`, {
  signal: AbortSignal.timeout(180_000),
});
const elapsedMs = Date.now() - started;
const body = await response.text();
const responseHeader =
  response.headers.get("payment-response") ?? response.headers.get("x-payment-response");
const settlement = responseHeader ? decodePaymentResponseHeader(responseHeader) : undefined;
const payerNonceAfter = await nonceOf(payer.address);
const payeeBalanceAfter = await balanceOf(payee.address);

console.log(
  JSON.stringify(
    {
      mode,
      httpStatus: response.status,
      responseHeaders: Object.fromEntries(response.headers.entries()),
      body: body.slice(0, 300),
      elapsedMs,
      txHash: settlement?.transaction ?? null,
      settlementSuccess: settlement?.success ?? null,
      payer: payer.address,
      payee: payee.address,
      payerNonceBefore: payerNonceBefore.toString(),
      payerNonceAfter: payerNonceAfter.toString(),
      payeeBalanceBeforeMicroCcd: payeeBalanceBefore.toString(),
      payeeBalanceAfterMicroCcd: payeeBalanceAfter.toString(),
      payeeDeltaMicroCcd: (payeeBalanceAfter - payeeBalanceBefore).toString(),
    },
    null,
    2,
  ),
);
