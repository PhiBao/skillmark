#!/usr/bin/env bash
# Hourly Skillmark audit, invoked by Hermes cron with --no-agent.
# Calls the same audit_installed implementation as the MCP tool.
set -euo pipefail
REPO="${SKILLMARK_REPO:-$HOME/concordium}"
cd "$REPO"
node --import tsx --input-type=module <<'JS'
import { createRegistryReader } from "./packages/core/src/verifier.ts";
import { loadConfig } from "./packages/core/src/config.ts";
import { auditInstalled, renderAudit } from "./apps/mcp/src/tools/audit.ts";
const report = await auditInstalled({ reader: createRegistryReader(loadConfig()) });
console.log(renderAudit(report));
JS
