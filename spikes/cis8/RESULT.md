# T03 — SPIKE B result: CIS-8, RegisterData and CIS-8004

Date: 2026-11-23 (UTC). Network: **testnet only** (`ccd:4221332d34e1694168c2a0c0b3fd0f27`, CIS-8 `<12801,0>`, CIS-8004 `<12802,0>`). No keys were printed. The custom namespace `skillmark:v1` works — no fallback to `solana:devnet` needed. Verified with `pnpm --filter spike-cis8 run all` (plus a corrected anchor run, below).

## Verdict: PASS (with two documented constraints)

### Transactions (all **finalized**, verified via gRPC `getBlockItemStatus`)

| Step | Tx hash | Explorer |
|---|---|---|
| CIS-8 register | `ae6b4c7a16fbf2e42d1f717d720598da3d577a2857db5e8b960896519fd37d45` | https://ccdexplorer.io/testnet/transaction/ae6b4c7a16fbf2e42d1f717d720598da3d577a2857db5e8b960896519fd37d45 |
| CIS-8 revoke | `6067cae819d6ad07d50cd9858f0496a4a7ad8e939a443c083bb6b95e14d61edc` | https://ccdexplorer.io/testnet/transaction/6067cae819d6ad07d50cd9858f0496a4a7ad8e939a443c083bb6b95e14d61edc |
| RegisterData anchor (45 bytes) | `bd9f9ee36b692a4a64e0193cde74caaf91fd61844fe349f7b5ea0d9e4b66ed15` | https://ccdexplorer.io/testnet/transaction/bd9f9ee36b692a4a64e0193cde74caaf91fd61844fe349f7b5ea0d9e4b66ed15 |
| CIS-8004 agent register | `4bb16f35ed53b3b7b79840cf5961a1e88e57c1a97a403d5a857a75e938e92376` | https://ccdexplorer.io/testnet/transaction/4bb16f35ed53b3b7b79840cf5961a1e88e57c1a97a403d5a857a75e938e92376 |

Demo key used (public only): namespace `skillmark:v1`, key_type `ed25519`, `public_key_hex = 3b5aa60b010fd005e5ccdb7a6371f6c36e037c621d81b286a9966266772416bd`. Proof scheme `solana-ed25519`; signature is the raw Ed25519 signature over the exact `bytes_hex` returned by `build_cis8_canonical_bytes` (no wrapping). `build_cis8_register` output fields: `contract_address`, `receive_name = "CIS-8.registerExternalKey"`, `parameter_json`, `parameter_hex`, `suggested_energy = 30000`, `sender`. Submitted with `Transaction.updateContract(...).addMetadata({sender, nonce, expiry}).build()` → `signAndFinalize` → `sendTransaction` → `waitForTransactionFinalization`.

## `ownerOfKey` raw responses, before and after revoke

**Registry MCP `owner_of_key` — before revoke:**

```json
{ "network": "testnet", "owner": "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
  "external_key": { "namespace": "skillmark:v1", "key_type": "ed25519",
    "public_key_hex": "3b5aa60b010fd005e5ccdb7a6371f6c36e037c621d81b286a9966266772416bd" },
  "proof_scheme": "solana-ed25519",
  "metadata": [ { "key": "label", "value": "t03-spike" }, { "key": "purpose", "value": "skillmark-signing" } ],
  "status": "Active", "last_updated": "2026-11-23T07:18:52.623+00:00" }
```

**Registry MCP `owner_of_key` — after revoke:** identical except `status: "Revoked"` and `last_updated: "2026-11-23T07:19:00.623+00:00"`. The entry stays on chain.

**Direct `client.invokeContract`** — contract name from `getInstanceInfo(<12801,0>).name.value = "init_CIS-8"` → receive name `CIS-8.ownerOfKey`. Parameter is the CIS-8 `ExternalKeyId`: three `u32`-little-endian length-prefixed byte strings (namespace, key_type, 32-byte public key):

```
0c000000 736b696c6c6d61726b3a7631 07 000000 65643235353139 20 000000 <32-byte key>
```

- Before revoke: `tag: success`, `returnValue` starts with **`01`** followed by the registration and status byte `00`, ending `...7369676e696e6700cf9d4507a2010000`; used energy 521.
- After revoke: `tag: success`, `returnValue` again starts with **`01`** (same registration) but the status byte is `01`, ending `...7369676e696e67010fbd4507a2010000`.
- Unknown key (probe `11`×32): `returnValue = "00"`.

**Answer to [S Spike B]:** a revoked key returns **`1 ‖ Registration` with a Revoked status byte**, **not `0`**. The verifier must handle both shapes (A§4.6 rows 6 and 7): check the status byte when a registration is returned, and treat `0` plus a prior `verified` index record as revoked too.

## RegisterData (A§4.10)

45-byte payload: `"SKM1"` `534b4d31` ‖ version `01` ‖ 32-byte root (zero in the spike) ‖ seq `0000000000000001` (u64 BE):

```
534b4d310100000000000000000000000000000000000000000000000000000000000000000000000000000001
```

On-chain `dataRegistered` for tx `bd9f9ee3…` is exactly those 45 bytes. The anchor was sent from the **hermes** account.

**Size limit confirmed:** 256 bytes succeeds (tx `a41fc0f687af2363bbaa5b8a314eb95975d759b15053ca0693b937b76e03fd3a`); 257 and 512 throw `Error: A data blob's size cannot exceed 256 bytes` from the SDK constructor. So the 45-byte anchor has ample room. **Implementation note:** `DataBlob.fromJSON(hex)` expects a *length-prefixed* JSON hex string; use `new DataBlob(Uint8Array.from(bytes).buffer)` for raw bytes.

## CIS-8004 agent for hermes (F5)

- `build_agent_card` returned canonical card JSON and `metadata_hash_hex = 87a0059c3e5c8416eae522734a7ff3f80ffecde7121fba5b1b1cfacecab2f05a`; local SHA-256 of the exact served bytes matches.
- First `build_register` used the full card hosted as an httpbin base64 echo URL (~2.8 KB). The tx finalized but the contract outcome was **`failed` / `RejectedReceive` with reason `-2147483648`** — the URI is too large for the contract parameter. **Constraint:** host the card at a short URL.
- Second `build_register` with a short URI and `external_reference.kind = "Cis8"` (`contract_address <12801,0>`, `key {namespace, key_type, public_key_hex}`) succeeded: tx `4bb16f35…`. `agent_by_external_reference` then returned:
  - `token_id = 1446`, `token_address` / **badge string `JyP9X27NaWPtZcxP3kqNX`**, owner `4Vrg5rkHN7m2STNTgYAqrxHE1jMAhkeZZ3rfifmtattD9PE5dK`, `status: "Active"`, and the Cis8 external reference echoed back exactly.
- `check_badge` on the badge string: `on_chain_agent_found: true`, `status_active: true`, `has_agent_uri: true`, but **`badge_valid: false`** because `card_fetched: false` — the placeholder URI `https://example.invalid/agent-card.json` does not resolve. `verify_agent_card.match = null` for the same reason.

**Answer for T17:** registration + badge string work with a short Cis8 external reference. To get `badge_valid/extension_conformant/verification_present = true`, the card must be served at a short, publicly fetchable URL whose bytes hash to the pinned `metadata_hash`; that will be the Render index (`/agents/hermes/agent-card.json`) after H4, not a gist-sized data URL.

## Fallback

Not needed: custom namespace `skillmark:v1` registered and revoked successfully on testnet. The `solana:devnet` fallback was not used.

## Notes for T07/T17

- `contract_info(testnet)` confirms `cis8_contract <12801,0>`, `cis8004_contract <12802,0>`, admin `3whdieGHx43KKRwQYbC5pAUdmWZ61B7yreNRU9i36MtdCvajR8`.
- `getInstanceInfo` gives `name = "init_CIS-8"`; entrypoints include `CIS-8.ownerOfKey`, `CIS-8.registerExternalKey`, `CIS-8.revoke`.
- `contract_info.explorer_base` is `https://testnet.ccdscan.io`, but the product standardises on `https://ccdexplorer.io/testnet/...` (A§3) for all links.
