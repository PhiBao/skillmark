# Proof matrix

Every claim with a check a judge can run. All links are testnet. Where a command needs a local Hermes, the expected line is quoted.

| # | Claim | Check | Expected |
|---|---|---|---|
| 1 | A human's key is bound to an identity-backed account | Open the CIS-8 register tx: https://ccdexplorer.io/testnet/transaction/ae6b4c7a16fbf2e42d1f717d720598da3d577a2857db5e8b960896519fd37d45 · then `owner_of_key` with `namespace: skillmark:v1`, `key_type: ed25519`, `public_key_hex: 3b5aa60b010fd005e5ccdb7a6371f6c36e037c621d81b286a9966266772416bd` | tx finalized; `owner` = `45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q`, `status` Active |
| 2 | Revocation is recorded and readable | Revoke tx: https://ccdexplorer.io/testnet/transaction/d14ba77cbf2d4894a9486a0662b207e9b9e9700b6f4e0e256ed262e38573168f · run `pnpm skillmark verify fixtures/skills/invoice-parser` against that key | tx finalized; verifier prints `REVOKED` |
| 3 | Tampering is detected | Change one byte of a signed `SKILL.md`, run `pnpm skillmark verify <dir>` | `TAMPERED`; Hermes refuses install |
| 4 | Unsigned skills do not install | `pnpm skillmark verify fixtures/skills/unsigned/invoice-parser` | `UNSIGNED`; `install_skill` returns “Not installed” |
| 5 | The scanner is never bypassed | Serve the fixtures with `pnpm --filter spike-hermes serve`, then `hermes skills install 'well-known:http://127.0.0.1:47402/.well-known/skills/env-reporter'` (needs `security.allow_private_urls: true`) | `Verdict: DANGEROUS`; install blocked; `--force` does not override. See `spikes/hermes/RESULT.md` |
| 6 | Pay on delivery, fee sponsored | Paid delivery tx: https://ccdexplorer.io/testnet/transaction/cafcf2c033b42c4e1b5f9cb29de4fd2a7b6fd6e7081d0bb5659b3595879c05c7 | finalized `transfer`; payer `3mhv…`; payee `4Vrg…` +0.25 CCD; `sponsor` `3uR2…` paid the fee |
| 7 | A failed bundle response never settles | `pnpm --filter index test:testnet` | paid bundle 200 + one settlement; broken bundle ≥ 400 and **zero** settlements |
| 8 | The buyer verifies the seller's agent badge | `curl https://agent-registry-mcp.concordium.com/v1/check-badge/JyP9X5PpNatg3zfjCcn3S` | `badge_valid: true`, `extension_conformant: true`, `verification_present: true`, no issues |
| 9 | The seller's card hash is pinned | `https://skillmark-index.onrender.com/agents/hermes/agent-card.json` SHA-256 | equals on-chain `f8a56aa1c85d1111e7d11c84b9c4d4622243186b4142f2d709f32b3571165b16` |
| 10 | The local audit log is hash-chained | `pnpm --filter core test log` | editing one line → `verifyChain` fails |
| 11 | The log root is anchored on chain | Anchor tx: https://ccdexplorer.io/testnet/transaction/a6c1c0f3fc693663cd9a4ad62e3225f50c371743003a375ba822bc7cb09b44bf · `pnpm skillmark anchor-verify a6c1c0f3… ~/.hermes/skillmark/log.jsonl` | explorer shows 45-byte `dataRegistered`; CLI prints `MATCH` |
| 12 | One revocation quarantines every agent | Install on two profiles, revoke the key, call `audit_installed` on each | `QUARANTINED`; skill disappears from `hermes skills list`; copy remains in `~/.hermes/skillmark-quarantine/` |
| 13 | Only `verified` skills install | `apps/mcp/test/failure.test.ts` | tampered listing → `TAMPERED` + `Not installed`, before Hermes or a wallet is touched |
| 14 | The verifier fails closed | `packages/core/test/failure.test.ts` | chain unreachable → `unknown-key`; MCP disagreement → `registry-mismatch`; revoked → `revoked` |
| 15 | Spend limits cannot be raised by tool input | `apps/mcp/test/spend.test.ts` | per-skill/day caps enforced; concurrent calls serialised; only reservations within the day cap succeed |
| 16 | The onboarding path works | Paste into Hermes: `Read https://skillmark-index.onrender.com/llms.txt and set up Skillmark.` | Hermes installs `skillmark`, adds the MCP server (asking first), runs `verify_skill invoice-parser` → `VERIFIED` |
| 17 | The provenance page is honest under failure | `https://skillmark-index.onrender.com/s/invoice-parser/1.0.0?fixture=unreachable` | “Couldn’t reach testnet. Nothing is shown as verified.”; no verified stamp |
| 18 | Accessibility | `docs/screens/lighthouse-a11y.json` | Lighthouse accessibility score 100 |

## Useful one-liners

```bash
# Verify a published bundle
pnpm skillmark verify https://skillmark-index.onrender.com/s/invoice-parser/1.0.0

# Well-known index
curl -fsS https://skillmark-index.onrender.com/.well-known/skills/index.json

# Provenance API
curl -fsS https://skillmark-index.onrender.com/api/provenance/invoice-parser/1.0.0

# Registry MCP owner read
curl -sS -X POST https://agent-registry-mcp.concordium.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"owner_of_key","arguments":{"network":"testnet","external_key":{"namespace":"skillmark:v1","key_type":"ed25519","public_key_hex":"3b5aa60b010fd005e5ccdb7a6371f6c36e037c621d81b286a9966266772416bd"}}}}'
```
