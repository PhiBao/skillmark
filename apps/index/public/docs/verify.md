# Verify a skill

## CLI

```bash
npx skillmark verify ./my-skill
npx skillmark verify https://skillmark-index.onrender.com/s/invoice-parser/1.0.0
```

The first form checks the directory on disk. The second downloads the published bundle, recomputes its manifest hash, verifies the ed25519 signature, and reads CIS-8 `ownerOfKey` on Concordium testnet.

Possible results: `VERIFIED`, `UNSIGNED`, `TAMPERED`, `REVOKED`, `UNKNOWN KEY`, `WRONG REGISTRY`, `REGISTRY MISMATCH`.

## Registry MCP

`owner_of_key` with:

```json
{
  "network": "testnet",
  "external_key": {
    "namespace": "skillmark:v1",
    "key_type": "ed25519",
    "public_key_hex": "<your key>"
  }
}
```

Expect `status: "Active"` for a usable key. Skillmark cross-checks this against a direct chain read and fails closed on disagreement.

## What a passing check means

An ID-backed human signed these exact contents and the key is still active. It does **not** mean the skill is safe. The Hermes scanner still decides “dangerous”, and that verdict is never overridden.

Testnet only. Test identities are not real KYC.
