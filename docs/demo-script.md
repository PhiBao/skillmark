# Demo script — draft (T20; finalised in T34)

Target: ≤ 3:00. Human voice, real screen recordings, no speed-up without a label. Publisher and buyers are operated by the Skillmark team (D15). Identity limits damage; it does not prove safety.

## Before recording

```
pnpm tsx scripts/demo-reset.ts
```

That registers a fresh `alice-k2`, re-signs and republishes `invoice-parser` (free) and `meeting-notes` (0.25 CCD, payTo Hermes), clears demo installs (quarantine kept) and resets spend counters. It prints the demo checklist. Local profiles: `default` (publisher/Hermes seller) and `buyer-b` (buyer).

## Shots

| Time | Screen | Narration | Exact state / URL |
|---|---|---|---|
| 0:00 | Home page | “1,184 malicious skills from 12 accounts. Hermes trusts four repos; everyone else is a stranger.” Then the one-sentence identity. | `https://skillmark-index.onrender.com/` |
| 0:20 | Hermes (default) | “Install invoice-parser.” Skillmark shows signed ✓, key owner ✓ identity-backed, active ✓, then installs through Hermes’s own scanner. | `install_skill invoice-parser` |
| 0:35 | CCDExplorer | “The skill was free; the anchor and key transactions are on testnet.” | register tx from `demo-reset` output |
| 0:55 | `skillmark verify` + Hermes | A tampered mirror is refused (TAMPERED). An unsigned clone is UNSIGNED and not installed. | `pnpm skillmark verify fixtures/skills/tampered/invoice-parser`; `... unsigned/invoice-parser` |
| 1:20 | Hermes seller + buyer-b | Hermes publishes a skill it made (`meeting-notes`, 0.25 CCD). Buyer-b checks Hermes’s Agent Card/badge, pays, installs. | `publish_skill` output; `install_skill meeting-notes` in `buyer-b`; tx `cafcf2c0…` shape |
| 1:55 | CLI + MCP | “Her key is revoked.” One revoke tx. Then `audit_installed` on both agents: the skill is quarantined, not deleted. | `pnpm skillmark revoke alice-k2`; `audit_installed` |
| 2:20 | Anchor | `anchor_log` writes a 45-byte RegisterData root; `anchor-verify` prints MATCH. | `pnpm skillmark anchor-verify <tx> ~/.hermes/skillmark/log.jsonl` |
| 2:35 | Provenance page | Show the six ruled ledger lines, explorer links and the D16 limits box. | `https://skillmark-index.onrender.com/s/invoice-parser/1.0.0` |
| 2:50 | Closing card | “One transaction pulls a bad skill off every agent.” | — |

## Fallback

Record the same flow once against the local index (`INDEX_PUBLIC_URL=http://127.0.0.1:8099 pnpm tsx scripts/demo-reset.ts`) and keep that file for live judging if Render cold-starts or the network fails. Label the fallback as recorded on testnet on the same day.

## Honest labels on screen

- Testnet; identities are test identities, not real KYC.
- Publisher/buyers are Skillmark-operated (D15).
- “Verified” means an ID-backed key signed the exact contents; the Hermes scanner still decides “dangerous”, and that verdict is never overridden (D16).
