# T02 — SPIKE A result: x402 pay-on-delivery on testnet

Date: 2026-11-23 (UTC). Network: Concordium **testnet** (`ccd:4221332d34e1694168c2a0c0b3fd0f27`). No keys were printed or logged. **Our own in-process facilitator was used for the pass criterion** — not the public `ccd-facilitator.vercel.app`.

## Verdict: PASS

Both commands from the task ran successfully:

```
pnpm --filter spike-x402 run ok
pnpm --filter spike-x402 run fail
```

### `/ok` — settled, pay-on-delivery

- HTTP **200**, body `{"ok":true}`, elapsed **27,828 ms** on the first run and **26,374 ms** on the capture run (request → payment → 20 s handler delay → sponsor co-sign → finalize → response).
- Settled tx (finalized, verified via gRPC `getBlockItemStatus`):

  **`dfca10972b8788de78dee6f1331aa211bb9a74d6f22166273a0ee4f5e1b76bd5`**

  Explorer: https://ccdexplorer.io/testnet/transaction/dfca10972b8788de78dee6f1331aa211bb9a74d6f22166273a0ee4f5e1b76bd5

- On-chain summary: `transactionType: transfer`, sender `4Vrg5rkHN7m2STNTgYAqrxHE1jMAhkeZZ3rfifmtattD9PE5dK` (hermes/payer), `sponsor` `3uR2Rp5oPsCJy7Btf3rXUNxujRiz6dJhdfp1k3hMPNr3GHTcWB` with cost **5,222,566 microCCD** — the sponsor paid the fee.
- Recipient `45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q` (alice/payee), **+100,000 microCCD = +0.1 CCD**, exactly the configured price.
- Payer account nonce increased `1 → 2 → 3` across the two successful paid runs.
- Settlement receipt came back in the response header **`payment-response`** (not `X-PAYMENT-RESPONSE`); decoded via `decodePaymentResponseHeader` from `@x402/fetch`. It reports `success: true`, the payer, the tx hash and the testnet network.

### `/fail` — no settlement

- HTTP **422** from the handler, elapsed 872 ms, no `payment-response` header.
- Payer nonce **3 → 3** (unchanged), payee balance **20,000,200,000 → 20,000,200,000 microCCD** (unchanged).
- Confirms `@x402/express` only settles when the handler returns status `< 400`.

## Exact client configuration required for CCD

CCD is **not** one of x402's recognised "default" assets, so the default spend controls (`$1` cap on default assets) silently reject it. The client must explicitly allow it:

```ts
const client = new x402Client()
  .register(
    "ccd:*",
    new ExactConcordiumScheme({
      accountAddress: AccountAddress.fromBase58(payer.address),
      signer: buildBasicAccountSigner(privateKeyFromWalletExport),
    }),
  )
  .setSpendControls({
    allowedAssets: [
      { network: "ccd:4221332d34e1694168c2a0c0b3fd0f27", asset: "CCD", maxAmountPerPayment: "1000000" },
    ],
  });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);
```

Without the `allowedAssets` entry the payment requirements are filtered out before a payload is built. This is the answer to the [S] question in A§3 and must be carried into T16.

## Facilitator and routes

- `GET /facilitator/supported` → `kinds: [{x402Version:2, scheme:"exact", network: <testnet CAIP-2>, extra.feePayer: sponsor}]`; `signers["ccd:*"] = [sponsor]`.
- `POST /facilitator/verify` and `POST /facilitator/settle` delegate to `x402Facilitator` with `ExactConcordiumScheme` (`@x402/concordium/exact/facilitator`) and `toConcordiumFacilitatorSigner(sponsor, signer, {host:"grpc.testnet.concordium.com", port:20000, useTls:true, network})`.
- Resource server: `x402ResourceServer(new HTTPFacilitatorClient({url: <own /facilitator>}))` with `@x402/concordium/exact/server`; price `{amount:"100000", asset:"CCD"}`, `payTo = alice`.

## Implementation notes for T15

1. The x402 Express middleware initialises its HTTP wrapper **eagerly at `app.use()` time**, fetching `/facilitator/supported` over HTTP. If the listener is not up yet it caches a failed promise and every protected request returns 500. Register the middleware **after** `app.listen()` has emitted `listening`, and register the protected handlers **after** the middleware.
2. Settlement receipt header is `payment-response`; decode with `decodePaymentResponseHeader`.
3. `requireFinalization: true` (default) makes settle wait for chain finality — budget ~26–28 s per paid install.
4. Prices stay ≤ 1 CCD (D7); this spike used 0.1 CCD.

## Fallback

Not needed. x402 exact + sponsored CCD works on testnet with our own facilitator, so the Must Ship fallback (free skills + direct transfer receipts) is not used.
