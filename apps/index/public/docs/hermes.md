# Set up Skillmark in Hermes

You are an agent setting up Skillmark on a Hermes host. Follow these steps in order. Ask your human before any step marked **ask**.

## Prerequisites

- Node.js 22 or newer (`node --version`).
- Hermes with the `hermes` CLI on PATH (`hermes --version`).
- Network access to `https://skillmark-index.onrender.com` and Concordium testnet.

## 1. Install the package — **ask first**

Installing a global npm package changes the machine. Ask your human, then run:

Until npm publication, use the tested GitHub release asset:

```bash
npm i -g https://github.com/PhiBao/skillmark/releases/download/v0.3.1/skillmark-0.3.1.tgz
```

If npm refuses remote URLs with `EALLOWREMOTE`, download the same asset, verify its published SHA256, and install from the local file:

```bash
curl -fsSL -o /tmp/skillmark-0.3.1.tgz \
  https://github.com/PhiBao/skillmark/releases/download/v0.3.1/skillmark-0.3.1.tgz
sha256sum /tmp/skillmark-0.3.1.tgz
# expected: 6ebf082a108d716e507bd01658b7b4bfc9ff57bf257e2dd74f7e2f8ec8bc14df
npm i -g /tmp/skillmark-0.3.1.tgz
```

This is byte-identical to the release asset. Some Hermes hosts also block transitive `postinstall` scripts through npm's `allowScripts`; the CLI still works.

After npm publication, `npm i -g skillmark@0.3.1` also works.

Free-only mode needs no wallet. Paid installs need a testnet Concordium wallet export that your human creates and places themselves (see step 5).

## 2. Write the config and print the MCP block

```bash
skillmark init
```

This writes `~/.skillmark/config.json` (mode 0600) and prints an `mcp_servers` block.

## 3. Add the MCP server — **ask first**

Editing Hermes config changes the host. With your human's OK, either run:

```bash
skillmark init --write-hermes-config
```

or paste the exact block printed by `skillmark init` into the active profile's `config.yaml`. Keep the absolute paths and `HERMES_HOME` value it prints; do not replace them with `~`, because Hermes environment values may not expand it.

Restart Hermes (or reload MCP). Confirm the tools:

```bash
hermes mcp test skillmark
```

You should see `verify_skill`, `install_skill`, `audit_installed`, `protection_status`, `anchor_log`, `publish_skill`. If an already-running chat session does not see newly added tools, restart the Hermes gateway/session; direct stdio calls are only a diagnostic fallback, not required for normal use.

## Automatic revocation protection

While the Skillmark MCP server is running, it re-checks installed signing keys every 60 seconds. Ask it for `protection_status` to see the last audit and any trust-root error. A temporary chain outage leaves skills installed and marks the check uncertain; a definite revocation or tampering quarantines the skill.

For protection when Hermes is closed, ask your human before running:

```bash
skillmark init --with-audit-cron
```

This enables Hermes's loopback install permission and creates `skillmark-hourly-audit`. The cron fires only while a Hermes gateway/scheduler is running. Check it with `hermes cron status` and `hermes cron list`.

## 4. Test on the free demo skill

Call `verify_skill` with `{ "name": "invoice-parser" }`. Expected line:

```
✓ invoice-parser 1.0.0 — VERIFIED
```

Then `install_skill` with the same name. Skillmark stages the verified bundle on loopback and runs `hermes skills install`, so Hermes's scanner still runs. `dangerous` is never overridden.

## 5. Paid installs (optional) — **ask first**

A paid install spends testnet CCD. Your human must:

1. Create a testnet identity and account in Concordium Wallet for Web.
2. Export the account to `~/.skillmark/wallets/hermes.export` (mode 0600).
3. Fund it from the testnet faucet.

Never ask for a seed phrase, and never invent or print a key. Paid installs are capped at 1 CCD and checked against persisted per-skill and per-day limits. The fee is sponsored.

## 6. Audit

Call `protection_status` or `audit_installed` to re-verify everything installed through Skillmark. Anything whose key was definitely revoked is copied to `~/.hermes/skillmark-quarantine/` and uninstalled.

## Limits

- Testnet only. Identities are test identities, not real KYC.
- “Verified” means an ID-backed key signed the exact contents. It does not prove the skill is safe. The Hermes scanner still decides “dangerous”, and that verdict is never overridden.
- The demo publisher and buyers are operated by the Skillmark team.
