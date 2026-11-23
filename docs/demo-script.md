# Demo script — final (T34)

Target: **≤ 3:00**. Human voice, real screen recordings, no speed-up without a label. Publisher and buyers are operated by the Skillmark team (D15); show that on screen. Identity limits damage; it does not prove safety.

## Before recording

```bash
pnpm tsx scripts/demo-reset.ts
```

Prints the demo state: a fresh `alice-k2` (registered), `invoice-parser` and `skillmark-setup` free, `meeting-notes` at 0.25 CCD paid to Hermes, installs cleared (quarantine kept), spend reset. Profiles: `default` (publisher + Hermes seller) and `buyer-b`.

URLs: index `https://skillmark-index.onrender.com`, provenance `/s/invoice-parser/1.0.0`, badge `JyP9X5PpNatg3zfjCcn3S`.

## Shots

| Time | Screen | Narration | Exact state / command |
|---|---|---|---|
| 0:00 | Home page | “1,184 malicious skills from 12 accounts. Hermes trusts four repos; everyone else is a stranger.” Then read the one-sentence identity. | `https://skillmark-index.onrender.com/` |
| 0:18 | Hermes (default) | “Install invoice-parser.” Show the verified line: signed ✓, key owner ✓ identity-backed, active ✓. Hermes's scanner runs and the skill installs. | `install_skill {"name":"invoice-parser"}` |
| 0:36 | CCDExplorer | “The key that signed it is bound to an identity-backed account.” Open the latest CIS-8 register tx printed by `demo-reset`. | register tx from `demo-reset` output |
| 0:50 | CLI + Hermes | “A tampered mirror is refused. An unsigned clone never installs.” | `pnpm skillmark verify fixtures/skills/tampered/invoice-parser` → TAMPERED; `... unsigned/invoice-parser` → UNSIGNED |
| 1:05 | Hermes seller + buyer-b | “Hermes sells a skill it made.” `publish_skill` output; buyer-b checks Hermes's agent badge, pays 0.25 CCD, installs. Show the tx. | `publish_skill` (or reset published it); `install_skill {"name":"meeting-notes"}` in `buyer-b` |
| 1:30 | buyer-b | “Install invoice-parser here too, so two agents hold it.” | `install_skill {"name":"invoice-parser"}` in `buyer-b` |
| 1:42 | CLI + both agents | “Her key is compromised.” One `revoke alice-k2` tx, then `audit_installed` on both profiles: invoice-parser is quarantined on both; the Hermes-owned meeting-notes stays verified. | `pnpm skillmark revoke alice-k2`; `audit_installed` on `default` and `buyer-b` |
| 2:10 | Anchor | “The audit log is hash-chained and its root is on chain.” `anchor_log`, then `anchor-verify` prints MATCH. | `anchor_log`; `pnpm skillmark anchor-verify <tx> ~/.hermes/skillmark/log.jsonl` |
| 2:25 | Provenance page | Six ruled lines, explorer links, and the limits box. | `https://skillmark-index.onrender.com/s/invoice-parser/1.0.0` |
| 2:45 | Closing card | “One transaction pulls a bad skill off every agent.” | — |

## Rehearsal log (2026-11-23)

Two consecutive clean runs of the functional sequence, timed end to end:

| Run | Reset | 2 installs | Tampered/unsigned | Paid install | Revoke + 2 audits | Anchor + verify | Total |
|---|---|---|---|---|---|---|---|
| 1 | 14 s | 16 s | 1 s | 25 s | 25 s | 9 s | **96 s** |
| 2 | 15 s | 14 s | 1 s | 22 s | 12 s | 9 s | **93 s** |

Both runs ended with `invoice-parser` quarantined on **both** profiles, `meeting-notes` still verified, and `anchor-verify` printing `MATCH`.

## Fallback recording

Record the same flow once against a local index before the live session:

```bash
INDEX_PUBLIC_URL=http://127.0.0.1:8099 pnpm tsx scripts/demo-reset.ts
```

Run the local index with `DATA_DIR=./data pnpm --filter index start` (web built with `pnpm --filter web build`). Keep the recording as the fallback; label it as recorded on testnet the same day. If a live demo stalls, cut to the recording at the next shot boundary.

## Honest labels on screen

- Testnet; identities are test identities, not real KYC.
- Publisher and buyers are Skillmark-operated (D15).
- “Verified” means an ID-backed key signed the exact contents; the Hermes scanner still decides “dangerous” and that verdict is never overridden (D16).
