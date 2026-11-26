# Setting up Skillmark in Hermes

## Install and connect

```bash
npm i -g skillmark@0.3.1
```

For audit, the same tarball and checksum are on the GitHub release. Locked-down npm hosts that reject remote installs can download that asset, verify its SHA256, and install the local file.

```bash
skillmark init --dry-run
skillmark init --write-hermes-config
hermes mcp test skillmark
```

`init` respects `HERMES_HOME` and `HERMES_PROFILE`, writes `~/.skillmark/config.json` with mode 0600, and prints the exact MCP block. Free mode needs no wallet. Paid installs need a human-exported testnet wallet at `HERMES_WALLET_FILE`.

With explicit permission, `init` also sets `security.allow_private_urls: true`. Skillmark needs this only because Hermes fetches the verified staging bundle from `127.0.0.1`; the Hermes scanner still runs and a `dangerous` verdict is never overridden.

## Automatic protection

The MCP server audits installed keys every 60 seconds while it is running. Call `protection_status` for the last result. Chain outages are reported as uncertain and do not quarantine skills; definite revocation or tampering does.

For protection while Hermes is closed:

```bash
skillmark init --with-audit-cron
hermes cron status
hermes cron list
```

This writes `~/.hermes/scripts/skillmark-audit.sh` and creates `skillmark-hourly-audit` (`0 * * * *`, no LLM). The job calls the installed `skillmark-mcp audit` binary. It only fires while a Hermes gateway/scheduler is running; a one-off `hermes cron run <job>` works without one.

## Manual audit

```bash
skillmark-mcp audit
skillmark-mcp status
```

Or ask Hermes to call `audit_installed` / `protection_status`.

## Verification

```bash
skillmark --version
skillmark-mcp --version
```

Both should print `0.3.1`. A fresh profile should show all six tools:

- `verify_skill`
- `install_skill`
- `publish_skill`
- `audit_installed`
- `protection_status`
- `anchor_log`

Then: `verify_skill {"name":"invoice-parser"}` → VERIFIED; `install_skill` → Hermes scanner safe; `protection_status` → automatic audit interval and last result.
