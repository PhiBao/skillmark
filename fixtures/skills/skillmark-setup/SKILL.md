---
name: skillmark-setup
description: Set up Skillmark in Hermes: install the npm package, add the MCP server, and verify a skill.
version: 1.0.0
---

# Skillmark setup

Use this skill when a human asks you to “set up Skillmark” or pastes the Skillmark onboarding line.

## Steps

1. Confirm Node.js 22+ and the `hermes` CLI. Ask your human before installing global packages.
2. Run `npm i -g skillmark@0.3.0`.
3. Run `skillmark init` and read the printed `mcp_servers` block.
4. Ask your human before editing `~/.hermes/config.yaml`; then run `skillmark init --write-hermes-config` or paste the block.
5. Restart Hermes or reload MCP, then run `hermes mcp test skillmark`. Expect `verify_skill`, `install_skill`, `audit_installed`, `anchor_log`, `publish_skill`.
6. Call `verify_skill` for `invoice-parser`. Expect `VERIFIED`, then install it.

## Paid installs

Only with a human-provided testnet wallet export at `~/.skillmark/wallets/hermes.export`. Never ask for a seed phrase and never invent a key.

## Limits

Testnet only. Verification limits damage; it does not prove the skill is safe. The Hermes scanner still decides “dangerous”.
