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
npm i -g https://github.com/PhiBao/skillmark/releases/download/v0.3.0/skillmark-0.3.0.tgz
```

After npm publication, `npm i -g skillmark@0.3.0` also works.

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

or add the printed block to `~/.hermes/config.yaml` by hand:

```yaml
mcp_servers:
  skillmark:
    command: skillmark-mcp
    env:
      SKILLMARK_INDEX_URL: https://skillmark-index.onrender.com
      SKILLMARK_STATE_DIR: ~/.hermes/skillmark
      HERMES_WALLET_FILE: ~/.skillmark/wallets/hermes.export
      HERMES_SIGNING_KEY_FILE: ~/.skillmark/keys/hermes.json
```

Restart Hermes (or reload MCP). Confirm the tools:

```bash
hermes mcp test skillmark
```

You should see `verify_skill`, `install_skill`, `audit_installed`, `protection_status`, `anchor_log`, `publish_skill`.

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
