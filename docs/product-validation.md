# Product validation — upgrade run

Date: 2026-11-26. Product checks only; no submission activity.

## Cold-start catalogue

After a Render redeploy/restart, `GET /api/catalogue` returned:

- 3 listings, all VERIFIED;
- `invoice-parser` (free), `skillmark-setup` (free), `meeting-notes` (0.25 CCD, payTo Hermes);
- 4 labelled trust-test demos, separate from real listings.

`GET /api/provenance/meeting-notes/1.0.0` showed one paid install, `cafcf2c0…`. The seed inserted it only after gRPC confirmed the finalized transfer: buyer `3mhv…`, payee `4Vrg…`, amount 250000 microCCD, and a sponsor signature. No synthetic settlement row is used.

Seed tests also prove a revoked key is stored as revoked and omitted from the public well-known index, a chain outage is stored as unknown-key rather than verified, stale rows are refreshed on restart, and a listing is not attributed to an account that does not own its signing key.

## Fresh Hermes profile onboarding

Package: `skillmark@0.3.0`, installed from its packed tarball into a clean npm prefix.

1. Created a fresh local Hermes v0.23.3 profile (`upgrade-test`) with no `config.yaml`.
2. Ran `skillmark init --with-audit-cron`.
3. Hermes created its config, enabled loopback well-known installs, registered the `skillmark` MCP server, and created `skillmark-hourly-audit`.
4. `hermes mcp test skillmark` discovered all six tools: `verify_skill`, `install_skill`, `publish_skill`, `anchor_log`, `audit_installed`, `protection_status`.
5. `install_skill invoice-parser` returned VERIFIED, Hermes scanner SAFE, installed, and protection status.

The local test profile was removed after the test. The packed tarball was installed into an isolated temporary npm prefix; nothing was published. The founder's cloud Hermes was not used.

The final Hermes MCP e2e passed: a real testnet-registered key installed through Hermes's scanner and a tampered bundle was refused. Its first attempt hit a transient testnet gRPC 502 during chain registration; a direct chain verify was healthy, and the unchanged test passed on retry.

## Automatic revocation quarantine

With the MCP connection kept open (the same lifecycle Hermes uses):

1. Installed `invoice-parser` with a 2-second audit interval for the test.
2. Revoked its CIS-8 key: https://ccdexplorer.io/testnet/transaction/496e2f3a4d97af2e302d235270539fe25e8edadf71a7935e079aa59e7c7dd3a8
3. The watcher quarantined it without a manual `audit_installed` call.
4. `protection_status`: `1 checked · 0 verified · 1 quarantined · 0 uncertain`.
5. `hermes skills list` no longer contained `invoice-parser`; the files remained under `skillmark-quarantine/`.

## Seed recovery after the revocation test

The watcher test deliberately revoked `alice-k2`, which was also the shared key for the two free demo fixtures. The live index correctly marked both revoked. The fixtures were then re-signed with the already-active `demo-seed` key owned by the same testnet publisher account; no key status or chain result was fabricated. After redeploy, `/healthz` again reported 3 listings, 3 verified and 1 paid.

Startup now upserts the configured signed fixtures after verification, so a restart cannot leave an old VERIFIED row behind after revocation or a signed fixture rotation.

## Publisher and history pages

Live checks after the trust-network deploy:

- Alice's publisher record: VERIFIED, one observed active key, two published skills and two release events.
- Hermes's publisher record: VERIFIED, one active key and one paid install.
- `meeting-notes` provenance: VERIFIED, one total settlement linking to finalized testnet transaction `cafcf2c0…`.
- `/p/<account>` serves the publisher SPA route; publisher links from the home and provenance pages resolve.
- Browser snapshots showed the complete catalogue, observed key, release hashes and settlement link.

Tests cover key rotation, revoked/unreachable/unknown publishers, duplicate settlement receipts, total-versus-latest labels, and empty/error UI states. Publisher records explicitly say they are observations from this index, not reputation scores or complete account histories.

## Outage safety

A unit test proves a temporary chain read failure leaves the skill installed, reports it as uncertain, and retries on the next audit. Only definite revocation/tampering/mismatch or missing files trigger quarantine.

## Onboarding polish 0.3.1

- Updated the signed `skillmark-setup` fixture to install from the GitHub release asset instead of unpublished npm, and re-signed it with the active demo key.
- Removed manual Hermes YAML containing unexpanded `~` paths; setup now uses the exact absolute-path block printed by `skillmark init`.
- Hermes setup command failures now stop `init` with a nonzero error instead of printing success.
- Invalid audit intervals fail early; state directories are created with mode 0700.
- Added `skillmark-mcp --version`; both binaries report `0.3.1`.
- Installed the packed `0.3.1` tarball into a clean npm prefix, created a fresh local Hermes profile, discovered all six tools, verified and installed `invoice-parser`, and confirmed automatic audit status. The test profile was removed.

## Founder Hermes validation (H1/T38)

The founder installed `v0.3.1` on their Hermes host and reported:

- npm rejected the remote tarball URL with `EALLOWREMOTE`; they downloaded the same release asset with `curl`, matched SHA256 `6ebf082a…c14df`, and installed from the local file. No npm publication or remote fetch was needed.
- `skillmark --version` returned `0.3.1`; config and state directories were created with modes 0600 and 0700.
- `hermes mcp test skillmark` discovered all six tools. An already-running chat session did not see newly added tools, so the tools were driven over stdio for validation; a gateway/session restart is needed for native tool injection in normal use.
- `verify_skill` returned VERIFIED for `invoice-parser`; `install_skill` returned `Hermes scanner: safe · installed`; `protection_status` reported automatic 60-second auditing.
- No wallet was created, no paid skill was touched, and the hourly cron was not enabled at the founder's request.

This closes H1/T38. The local and cloud Hermes runs used the same published release asset.

## Still needs the founder

- **H9:** publish `skillmark@0.3.1` to npm. The tarball is built and tested, but the agent does not publish.
- **H7:** record the founder's demo from `docs/demo-script.md`; no synthetic footage is used.
- **H8:** external author validation. No replies have been fabricated.
