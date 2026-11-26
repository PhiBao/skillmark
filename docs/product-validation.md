# Product validation — upgrade run

Date: 2026-11-26. Product checks only; no submission activity.

## Cold-start catalogue

After a Render redeploy/restart, `GET /api/catalogue` returned:

- 3 listings, all VERIFIED;
- `invoice-parser` (free), `skillmark-setup` (free), `meeting-notes` (0.25 CCD, payTo Hermes);
- 4 labelled trust-test demos, separate from real listings.

`GET /api/provenance/meeting-notes/1.0.0` showed one paid install, `cafcf2c0…`. The seed inserted it only after gRPC confirmed the finalized transfer: buyer `3mhv…`, payee `4Vrg…`, amount 250000 microCCD, and a sponsor signature. No synthetic settlement row is used.

Seed tests also prove a revoked key is stored as revoked and omitted from the public well-known index, and a chain outage is stored as unknown-key rather than verified.

## Fresh Hermes profile onboarding

Package: `skillmark@0.3.0`, installed from its packed tarball into a clean npm prefix.

1. Created a fresh local Hermes v0.23.3 profile (`upgrade-test`) with no `config.yaml`.
2. Ran `skillmark init --with-audit-cron`.
3. Hermes created its config, enabled loopback well-known installs, registered the `skillmark` MCP server, and created `skillmark-hourly-audit`.
4. `hermes mcp test skillmark` discovered all six tools: `verify_skill`, `install_skill`, `publish_skill`, `anchor_log`, `audit_installed`, `protection_status`.
5. `install_skill invoice-parser` returned VERIFIED, Hermes scanner SAFE, installed, and protection status.

The profile and temporary global npm prefix were removed after the test. The founder's cloud Hermes was not used.

## Automatic revocation quarantine

With the MCP connection kept open (the same lifecycle Hermes uses):

1. Installed `invoice-parser` with a 2-second audit interval for the test.
2. Revoked its CIS-8 key: https://ccdexplorer.io/testnet/transaction/496e2f3a4d97af2e302d235270539fe25e8edadf71a7935e079aa59e7c7dd3a8
3. The watcher quarantined it without a manual `audit_installed` call.
4. `protection_status`: `1 checked · 0 verified · 1 quarantined · 0 uncertain`.
5. `hermes skills list` no longer contained `invoice-parser`; the files remained under `skillmark-quarantine/`.

## Outage safety

A unit test now proves a temporary chain read failure leaves the skill installed, reports it as uncertain, and retries on the next audit. Only definite revocation/tampering/mismatch or missing files trigger quarantine.

## Still needs the founder

- **H9:** publish `skillmark@0.3.0` to npm. The tarball is built and tested, but the agent does not publish.
- **H1:** run the one-line onboarding on the founder's cloud Hermes after H9.
- **H8:** external author validation. No replies have been fabricated.
