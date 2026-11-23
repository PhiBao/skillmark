# skillmark

Accountable skill publishing for Hermes. A community skill installs only if an ID-verified human signed it; the author is paid on delivery; a revoked key pulls the skill from every agent.

**Testnet only.** Identities are test identities, not real KYC. Verification limits damage; it does not prove the skill is safe. The Hermes scanner still decides “dangerous”, and that verdict is never overridden.

## Install

```bash
npm i -g skillmark
skillmark init
```

`skillmark init` prints the `mcp_servers.skillmark` block for `~/.hermes/config.yaml` (and writes it with `--write-hermes-config`). Restart Hermes, then ask it to verify a skill:

> Verify invoice-parser with Skillmark and install it.

Free-only mode needs no wallet. Paid installs need a testnet Concordium wallet export; set `HERMES_WALLET_FILE`.

## Commands

```
skillmark keygen <label>
skillmark register-key <label>
skillmark sign <dir> --key <label>
skillmark publish <dir> --index <url> [--price <ccd>] [--pay-to <addr>]
skillmark revoke <label>
skillmark verify <dir|url>
skillmark anchor-verify <txHash> <log.jsonl>
skillmark init [--index <url>] [--dry-run] [--write-hermes-config]
```

The MCP server (`skillmark-mcp`) exposes `verify_skill`, `install_skill`, `audit_installed`, `anchor_log` and `publish_skill`.

## Limits

- Only `verified` skills install; Hermes's scanner runs afterward and a `dangerous` verdict always wins.
- Prices are capped at 1 CCD; paid installs require explicit CCD spend controls.
- This package ships testnet contracts only and throws on any mainnet id.
