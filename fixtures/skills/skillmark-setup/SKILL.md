---
name: skillmark-setup
description: Set up Skillmark in Hermes: install the npm package, add the MCP server, and verify a skill.
version: 1.0.0
---

# Skillmark setup

Use this skill when a human asks you to “set up Skillmark” or pastes the Skillmark onboarding line.

## Steps

1. Confirm Node.js 22+ and the `hermes` CLI. Ask your human before installing global packages.
2. Run `npm i -g skillmark@0.3.1`. If this host blocks remote npm installs, download the checksummed GitHub release tarball and install the local file.
3. Run `skillmark init` and read the printed absolute-path `mcp_servers` block.
4. Ask your human before editing Hermes config; then run `skillmark init --write-hermes-config` or paste the exact printed block. For hourly audits when a Hermes scheduler is running, ask before `skillmark init --with-audit-cron`.
5. Restart Hermes or reload MCP, then run `hermes mcp test skillmark`. Expect `verify_skill`, `install_skill`, `audit_installed`, `protection_status`, `anchor_log`, `publish_skill`.
6. Call `verify_skill` for `invoice-parser`. Expect `VERIFIED`, then install it. Ask for `protection_status` to confirm automatic audit status.

## Paid installs

Only with a human-provided testnet wallet export at `~/.skillmark/wallets/hermes.export`. Never ask for a seed phrase and never invent a key.

## Limits

Testnet only. Verification limits damage; it does not prove the skill is safe. The Hermes scanner still decides “dangerous”.
