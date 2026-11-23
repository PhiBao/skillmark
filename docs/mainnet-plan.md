# Mainnet plan

Skillmark ships testnet-only. This is the path to production; nothing here is claimed as built.

## 1. Identity and onboarding

- Publishers create a **mainnet Concordium identity** with the Concordium ID App (real identity/KYC), then link it to a Concordium account.
- `skillmark register-key` targets the mainnet CIS-8 `<10081,0>` and uses the same ed25519 statement format; `config.ts` currently **refuses** any mainnet id, so mainnet support is an explicit config change plus a separate signed release.
- The same signed `SKILL.md` format works for any agentskills.io runtime (Claude, Codex, OpenClaw), which is distribution beyond Hermes.

## 2. Registries and records

- CIS-8 `<10081,0>` and CIS-8004 `<10082,0>` mainnet contracts.
- Keep the hash-chained local log and the 45-byte `RegisterData` anchor, but move to a **scheduled anchor cadence** (e.g. hourly) with a retention policy, and publish the anchor address so anyone can recompute.
- Add a **revocation watcher** (push, not poll) so agents quarantine within seconds of a revoke transaction, plus a key-rotation UX (register new key → re-sign → revoke old key).

## 3. Payments

- Keep x402 `exact` with sponsored fees, but run a **hosted facilitator with a budget** and monitoring: per-payee and global settle caps, alerting on failures, and a documented sponsorship policy.
- Add a **regulated EUR PLT** as an optional price asset (issuer-provided; decimals read on chain). CCD remains the default.
- Revenue: a small fee on paid installs; verification free for open-source authors.
- Custody stays at zero: Skillmark never holds buyer funds.

## 4. Business publishers

- Company identity via LEI and domain control when available, layered on top of the CIS-8 account binding.
- Separate trust labels for “verified human” and “verified organisation”, shown distinctly on the provenance page.

## 5. Operations

- **Durability:** replace Render free tier + ephemeral SQLite with durable storage and a stable process; keep the content-addressed bundle store in object storage.
- **Incident process:** use Concordium's lawful identity disclosure for abuse cases; keep evidence (bundle hash, signature, listing, settlement) for every report.
- **Monitoring:** chain/MCP read failures, facilitator settle failures, publish abuse, quarantine events.
- **Abuse:** rate limits in durable storage (not in-memory), allowlist review for payees, and a takedown policy for illegal content.

## 6. Milestones

1. **M0 (done, testnet):** CIS-8 keys, CIS-8004 badge, x402 paid delivery, audit/quarantine, anchor, provenance page.
2. **M1:** npm publication, real-author onboarding, quotes, and a durable index.
3. **M2:** mainnet identity onboarding, mainnet contracts, hosted facilitator with a budget.
4. **M3:** PLT price rail, organisation labels, revocation watcher, key rotation.
5. **M4:** cross-runtime distribution (Claude/Codex/OpenClaw) and a public verification API.

## 7. Risks

- **Identity ≠ safety:** mainnet raises the cost of abuse but does not remove prompt-injection risk. The scanner remains the final authority on `dangerous`.
- **Sponsorship economics:** sponsored fees can be drained; caps, budgets and payee review are mandatory before mainnet.
- **Regulatory:** paid skills and EUR PLT touch payments regulation; obtain legal review before launch.
- **Ecosystem dependency:** the format depends on agentskills.io conventions and Hermes's scanner behaviour; both can change.
