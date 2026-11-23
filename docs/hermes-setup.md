# Setting up Skillmark in Hermes

This is the operator guide for a Hermes host (the local dev Hermes, a friend's Hermes, or your own). An agent can follow it from `llms.txt` (T37); this file is the human-readable version.

## 1. Add the MCP server

Add to `~/.hermes/config.yaml` (or the active profile's config):

```yaml
mcp_servers:
  skillmark:
    command: node
    args:
      - --import
      - tsx
      - /absolute/path/to/concordium/apps/mcp/src/server.ts
    env:
      SKILLMARK_INDEX_URL: https://skillmark-index.onrender.com
      SKILLMARK_STATE_DIR: ~/.hermes/skillmark
      HERMES_HOME: ~/.hermes
      HERMES_BIN: hermes
      HERMES_WALLET_FILE: ~/.skillmark/wallets/hermes.export
```

For the distributed npm package (T36) the entry is just `command: skillmark-mcp`; `skillmark init` prints the exact block.

Restart Hermes, then confirm the tools are visible:

```bash
hermes mcp test skillmark
# ✓ Connected … Tools discovered: verify_skill, install_skill, anchor_log, audit_installed
```

## 2. Install a skill (one line in Hermes)

> Read https://<index>/llms.txt and set up Skillmark.

or, once configured:

> Verify `invoice-parser` with Skillmark, then install it.

The MCP calls Skillmark's verifier, stages the verified bundle on `127.0.0.1`, and runs `hermes skills install well-known:...` so **Hermes's own scanner still runs**. A `dangerous` verdict is never overridden.

## 3. Hourly audit (T26)

Skillmark can re-verify installed skills every hour and quarantine any whose signing key has been revoked.

Install the audit script into the active profile:

```bash
mkdir -p ~/.hermes/scripts
cp /absolute/path/to/concordium/scripts/skillmark-audit.sh ~/.hermes/scripts/
chmod +x ~/.hermes/scripts/skillmark-audit.sh
```

Create the hourly job (`--no-agent` means no LLM is called; the script's output is the job result):

```bash
hermes cron create '0 * * * *' \
  --name skillmark-hourly-audit \
  --script skillmark-audit.sh \
  --no-agent \
  --deliver local
```

Manage it:

```bash
hermes cron list
hermes cron run skillmark-hourly-audit     # queue one run on the next tick
hermes cron tick                          # execute due jobs once
hermes cron runs                          # durable execution history
hermes cron remove skillmark-hourly-audit  # stop it
```

The script calls the same `audit_installed` implementation as the MCP tool. It re-verifies each entry in `~/.hermes/skillmark/installed.json` against the files on disk and the chain. Anything no longer `verified` is copied to `~/.hermes/skillmark-quarantine/<name>-<timestamp>` **before** `hermes skills uninstall` removes it — never deleted outright.

## Verification performed (2026-11-23, Hermes v0.23.3)

The job was created (`id f5a61815ec59`), run once with `hermes cron run f5a61815ec59`, and the execution appeared in `hermes cron runs` (`279cef3d1394… completed`) with output saved to `~/.hermes/cron/output/f5a61815ec59/2026-11-23_08-32-48.md`:

```
✓ 1 installed skill(s) re-verified — all VERIFIED
```

After revoking a signing key on testnet, the same job printed:

```
✕ invoice-parser — QUARANTINED (no longer verified; moved to skillmark-quarantine)
```

`--deliver local` suppresses chat notifications; the run remains in the durable history and the Hermes log (`~/.hermes/cron/output/<job>/<timestamp>.md`).

**Scheduler caveat:** a one-off `hermes cron run` works without a gateway, but for the `0 * * * *` schedule to actually fire every hour, the host gateway must be installed and running (`hermes --profile default gateway install` / `gateway run`). `hermes cron status` reports whether a scheduler is serving the profile. This is an operator step, not something Skillmark changes.

## Notes

- On loopback, Hermes's SSRF guard requires `security.allow_private_urls: true` in the local dev config. The npm-distributed MCP serves the same well-known index on `127.0.0.1:47402`; `skillmark init` prints this line.
- The hourly job only needs read access to the chain and the Skillmark state dir. It never signs or spends.
- Revocation detection works even when `ownerOfKey` returns `0` with a prior `verified` record (A§4.6 row 7).
