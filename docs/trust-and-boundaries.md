# Trust and boundaries

Skillmark is a trust layer, not a safety guarantee. This page states exactly who holds what and what each check can prove.

## Who holds which key

| Key | Holder | Purpose | Can it move money? |
|---|---|---|---|
| Concordium account key (`alice`, `hermes`, `hermes-b`, `sponsor`) | The human operator | Sign account transactions (CIS-8, CIS-8004, RegisterData, transfers) | **Yes** — it controls the account balance |
| `skillmark:v1` ed25519 signing key (`~/.skillmark/keys/*.json`, 0600) | The publisher | Sign skill statements only. Bound to the account in CIS-8 | **No** — it cannot sign account transactions |
| Hermes signing key | The Hermes owner | Sign skills Hermes creates; bound to the Hermes account | **No** |
| Sponsor key | The index operator | Co-sign sponsored transfers and pay fees | **Pays fees only**; the amount/recipient come from the payer-signed transaction |
| Buyer wallet (`hermes-b`) | The buyer | Sign x402 transfers | **Yes**, within the buyer's balance and the coded spend limits |

The index never holds a publisher or buyer key. It holds only the sponsor key, provided as a Render secret, and only uses it to co-sign settlements that pass the facilitator's rules.

## What can move money

- **Paid install:** buyer → publisher, exact amount from the signed listing, `CCD`, testnet. The sponsor pays the network fee. The facilitator refuses settles whose `payTo` is not a verified listing payee or a CIS-8004 agent wallet, and caps settles per payee per minute.
- **Spend controls:** the MCP enforces per-skill (≤ 1 CCD) and per-day (≤ 3 CCD) limits in code, persisted in `spend.json` under a file lock. Tool input cannot raise them.
- **No custody:** Skillmark never holds buyer funds. The transfer settles directly to the publisher's account on delivery.

## What “verified” proves

1. The exact file set was signed by the ed25519 key in the statement.
2. That key is registered in CIS-8 `<12801,0>` and owned by an identity-backed Concordium account.
3. The key is currently Active; direct chain read and Registry MCP agree (a disagreement fails closed).

It does **not** prove:

- that the skill is safe, correct or free of prompt injection;
- that the publisher is a company or a real-world person beyond the testnet identity;
- that the contents will stay safe after installation (the scanner and the agent's own policy still apply).

**The Hermes scanner still decides “dangerous”, and a `dangerous` verdict is never overridden — not by Skillmark, not by `--force`, not by a verified publisher.**

## Trust boundaries

- **Chain read is the root.** The Registry MCP is a convenience and a cross-check; it is never trusted alone.
- **Hermes owns installation.** Skillmark stages the bundle on loopback and invokes `hermes skills install`, so the scanner and Hermes's policy run. Skillmark does not write into `~/.hermes/skills` itself.
- **Quarantine is reversible.** Revoked or tampered skills are copied to `~/.hermes/skillmark-quarantine/` before uninstall; nothing is permanently deleted.
- **The log is local and anchored.** The hash-chained log records public events only; the on-chain anchor is 45 bytes (root + sequence), never skill content.
- **The web is read-only.** Provenance pages read the index API; they never sign or move money.

## Threat model (summary)

| Threat | Mitigation |
|---|---|
| Malicious bundle paths (zip-slip, links) | Filter + `lstat` re-walk; links/absolute/`..` rejected |
| Decompression bomb | 500 files / 50 MiB uncompressed / 5 MiB upload caps |
| Signature replay under another name | Manifest rebuild + name/version comparison → `tampered` |
| Payment requirement substitution | payee/amount/network/asset/`manifestHash` checked before paying |
| Spend-limit bypass | file-locked persisted counters |
| Sponsor fee drain | payee allowlist + 10 settles/min/payee + low balance |
| Revoked key still trusted | direct `ownerOfKey` read; revoked status or prior-record rule |
| Dishonest MCP | disagreement fails closed (`registry-mismatch`) |
| Prompt injection in a skill | code-enforced limits; scanner still runs; content only after `verified` |
| Secret leakage | keys outside repo, 0600; no secrets in logs or git |

## Testnet limits

Identities are test identities, not real KYC. Publisher and buyers in the demo are operated by the Skillmark team (D15). The index runs on Render's free tier: cold starts (~1 min) and an ephemeral disk; listings are re-seeded at boot and runtime listings are non-durable.
