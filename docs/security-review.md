# Security review — sensitive flows (T27)

Date: 2026-11-23. Scope: tar extraction, publish abuse, signature replay, x402 requirements, spend limits, tool args, secrets, CORS, facilitator abuse, prompt injection, anchoring. No open high-severity finding.

## Findings

| # | Area | Severity | Finding | Fix / accepted risk |
|---|---|---|---|---|
| 1 | Tar extraction | High | A crafted bundle could use symlinks, hard links, absolute paths or `..` to write outside the extraction dir. | Both the index publish path and the MCP verifier reject any entry whose type is not `File`/`Directory` and any path that is absolute, contains `..` or a backslash, then re-walk the extracted tree with `lstat` and reject links/device files. Tests: symlink bundle → 400, manifest symlink → invalid. |
| 2 | Tar bomb | High | A 5 MiB compressed bundle can expand without bound. | Extraction now caps **500 files** and **50 MiB uncompressed** in both extractors, in addition to the 5 MiB compressed upload cap. Test: 60 MiB decompressed bundle → 400. |
| 3 | Signature replay | High | A valid `sig.json` could be reused under another name/version or with changed files. | `verifySkill` rebuilds the manifest from the extracted files, recomputes the JCS hash, and compares statement `name`/`version`. Mismatch → `tampered`. Tests: changed byte, changed name, changed signature. |
| 4 | x402 substitution | High | A malicious index could change payee, amount, network or asset between the 402 and settlement. | `assertRequirements` checks network = testnet, `payTo`, exact microCCD amount, asset `CCD` and `extra.manifestHash` against the signed listing before paying. One test per substituted field. |
| 5 | Spend-limit bypass | High | Concurrent tool calls could both pass per-day limits. | Reservations are serialised through an exclusive lock file (`open(..., "wx")`, 10 s deadline) and persisted in `spend.json`; the limit check and reservation happen under the lock. Test: four concurrent 1 CCD calls → exactly three succeed against a 3 CCD day cap. |
| 6 | Settle timeout | Medium | A timeout could cause a double payment. | A settle timeout rolls back the reservation and returns `payment status UNKNOWN`; the code never retries automatically. The receipt tx is logged when present. |
| 7 | Tool-arg traversal | High | `publish_skill(path)` could read/sign arbitrary files; `install_skill` could fetch arbitrary paths. | `publish_skill` resolves the path and requires it inside `HERMES_HOME/skills`; price is capped at 1 CCD. Install names/versions are looked up in the index listing; bundle paths are derived from the store. Tests for outside path and price. |
| 8 | Secret leakage | High | Keys/wallet exports could leak via logs, errors, git. | Wallet/key files live only in `~/.skillmark` (0600, 0700) and Render secrets. Repo `.gitignore` excludes `*.export`, `keys/`, `.skillmark/`, `.env`. Tool output prints public keys/addresses only; no tool logs private material. `git ls-files` contains only `.env.example`. |
| 9 | CORS | Medium | A browser on another origin could call the publish/facilitator APIs. | No `Access-Control-Allow-Origin` headers are set, so browsers block cross-origin reads/writes; the API is same-origin only. Publish is further rate-limited per IP (20/h default). |
| 10 | Facilitator abuse | Medium | An attacker could use the sponsor key to pay fees for junk settlements. | payTo must be a verified listing payee or own a CIS-8004 agent (A§10), and settles are capped at **10/min per payTo**. The sponsor key is testnet-only and kept at a low balance. Accepted residual risk: a patient allowlisted payee can still consume some testnet fees. |
| 11 | Prompt injection | Medium | A SKILL.md could try to make the agent raise limits or change recipients. | Limits, recipients, network and verifier rules are enforced in code; tool inputs are zod-validated and cannot change them. Skill content is only fetched after `verified`, and Hermes's scanner still runs; `dangerous` is never overridden. |
| 12 | Anchor contents | Low | The on-chain log anchor could leak skill contents. | The payload is exactly 45 bytes: magic, version, root hash, sequence. Tests assert it is 45 bytes and contains no skill text. |
| 13 | Web XSS | Medium | A listing could inject markup/links into the provenance page. | Values render as React text nodes (escaped). Explorer links are built from the fixed `https://ccdexplorer.io/testnet/...` base, not from listing-controlled URLs. |
| 14 | DB injection | Medium | Listing fields could alter SQL. | All statements are parameterised (`better-sqlite3` prepared statements); no string interpolation into SQL. |
| 15 | Chain / MCP disagreement | High | A dishonest MCP could report Active for a revoked key. | Direct chain read is the trust root; a disagreement fails closed (`registry-mismatch`), and chain errors never verify. Tests cover both. |
| 16 | Duplicate listing | Medium | A second publisher could overwrite another's listing. | The index stores only `verified` bundles and upserts by `(name, version)`; the signature is the auth, so an overwrite requires a valid signature over the same contents. Prior key history is retained. |

## Tests added

- `apps/index/test/publish.test.ts`: symlink bundle, oversized decompressed bundle, listing conflict.
- `apps/index/test/payments.test.ts`: per-payTo settle rate cap.
- `apps/mcp/test/spend.test.ts`: concurrent spend lock, publish path containment, price cap, every payment-requirement substitution.
- `packages/core/test/verifier.test.ts`: replay/tamper, chain unreachable, MCP disagreement.
- `packages/core/test/log.test.ts`: anchor size and no-content assertion.

## Accepted risks

- Testnet only; identities are test identities, not real KYC.
- In-memory rate limits reset on process restart (Render restarts replace memory). Low impact on testnet.
- Render free disk is ephemeral; listings are re-seeded at boot and runtime listings are documented as non-durable.
- “Verified” limits damage; it does not prove a skill is safe. The Hermes scanner remains the final authority on `dangerous`.
