import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AccountAddress, buildBasicAccountSigner, parseWallet } from "@concordium/web-sdk";
import { CONCORDIUM_TESTNET_CAIP2 } from "@x402/concordium";
import { ExactConcordiumScheme } from "@x402/concordium/exact/client";
import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPayment } from "@x402/fetch";
import { appendEntry } from "../../../../packages/core/src/log.ts";
import {
  agentByExternalReference,
  checkBadge,
  verifyAgentCard,
} from "../../../../packages/core/src/registryMcp.ts";
import { verifyStatement } from "../../../../packages/core/src/signature.ts";
import type { SignatureFile } from "../../../../packages/core/src/types.ts";
import type { Verification } from "../../../../packages/core/src/verifier.ts";
import {
  hermesInstall,
  hermesList,
  hermesUninstall,
  installSucceeded,
  verdictOf,
} from "../hermes.ts";
import { startLocalWellKnown } from "../localWellKnown.ts";
import {
  attachSettlement,
  checkAndRecordSpend,
  limitsFromEnv,
  rollbackSpend,
  SpendLimitError,
} from "../spend.ts";
import { addInstalled, readProtection, stateDir } from "../state.ts";
import { extractAndVerify, fetchAndVerify, type McpConfig, renderVerification } from "./verify.ts";

export interface Listing {
  name: string;
  version: string;
  price: { amountMicroCcd: string; asset: string } | null;
  payTo: string | null;
  manifestHash: string;
  [field: string]: unknown;
}

export interface RequirementOption {
  network: string;
  payTo: string;
  amount: string;
  asset: string;
  extra?: Record<string, unknown>;
}

/** Every pre-payment check. Throws on any substitution. */
export function assertRequirements(listing: Listing, option: RequirementOption): void {
  if (option.network !== CONCORDIUM_TESTNET_CAIP2)
    throw new Error(`Wrong network: ${option.network}`);
  if (option.payTo !== listing.payTo) throw new Error(`payTo changed: ${option.payTo}`);
  if (!listing.price) throw new Error("Listing is not paid");
  if (option.amount !== listing.price.amountMicroCcd)
    throw new Error(`Amount changed: ${option.amount}`);
  if (option.asset !== "CCD") throw new Error(`Asset changed: ${option.asset}`);
  if (option.extra?.manifestHash !== listing.manifestHash)
    throw new Error("manifestHash missing or changed in requirements");
}

function log(type: string, data: unknown): void {
  try {
    appendEntry(join(stateDir(), "log.jsonl"), type, data);
  } catch {
    // Logging must never block an install decision.
  }
}

async function listing(
  name: string,
  version: string | undefined,
  config: McpConfig,
): Promise<Listing> {
  const base = config.indexUrl.replace(/\/$/, "");
  const skills = (await (await fetch(`${base}/api/skills`)).json()) as Listing[];
  const matches = skills.filter((skill) => skill.name === name);
  const found = version ? matches.find((skill) => skill.version === version) : matches[0];
  if (!found) throw new Error(`Unknown skill: ${name}${version ? `@${version}` : ""}`);
  return found;
}

/** If the publisher key belongs to a CIS-8004 agent, surface its badge and refuse a revoked agent. */
async function publisherBadge(
  verification: Verification,
): Promise<{ refuse?: string; line?: string }> {
  if (!verification.owner_account || !verification.key.public_key_hex) return {};
  try {
    const agent = await agentByExternalReference({
      kind: "Cis8",
      contract_address: { index: 12801, subindex: 0 },
      key: verification.key,
    });
    if (!agent || !agent.token_address) return {};
    if (String(agent.status).toLowerCase() === "revoked") {
      return { refuse: "✕ Publisher agent is REVOKED — not installed." };
    }
    const badge = (await checkBadge(agent.token_address)) as { badge_valid?: boolean };
    const card = (await verifyAgentCard(agent.token_id)) as { match?: boolean | null };
    return {
      line: `  agent badge ${agent.token_address} ${badge.badge_valid ? "✓" : "✕"} · card ${card.match ? "matches" : "not matched"}`,
    };
  } catch {
    return {};
  }
}

async function installVerified(
  skillDir: string,
  name: string,
  version: string,
  manifestHash: string,
  owner: string,
): Promise<string> {
  const stageRoot = join(stateDir(), "staging");
  const stage = join(stageRoot, name);
  mkdirSync(stageRoot, { recursive: true });
  rmSync(stage, { recursive: true, force: true });
  cpSync(skillDir, stage, { recursive: true });

  const server = await startLocalWellKnown(stageRoot);
  try {
    // Replace any existing copy so Hermes rescans the newly verified bundle.
    await hermesUninstall(name);
    const result = await hermesInstall(`well-known:${server.url}/.well-known/skills/${name}`);
    const output = `${result.stdout}${result.stderr}`;
    const verdict = verdictOf(output);
    if (verdict === "dangerous" || !installSucceeded(result)) {
      log("blocked", { name, version, verdict, reason: "hermes-scanner-or-cli" });
      return `  Hermes scanner: ${verdict}\n  ✕ Install blocked — not installed.`;
    }
    addInstalled({
      name,
      version,
      manifestHash,
      owner,
      installedAt: new Date().toISOString(),
      stagePath: stage,
    });
    const list = await hermesList();
    const listed = list.stdout.toLowerCase().includes(name.toLowerCase());
    log("install", { name, version, verdict });
    const protection = readProtection();
    const audit = protection.automatic
      ? `automatic audit every ${Math.round(protection.intervalMs / 1000)}s`
      : "automatic audit off — run audit_installed or enable the hourly cron";
    return `  Hermes scanner: ${verdict} · ${listed ? "installed" : "install attempted"}\n  protection: ${audit}`;
  } finally {
    await server.close();
  }
}

export async function installSkill(
  name: string,
  version: string | undefined,
  config: McpConfig,
): Promise<string> {
  const found = await listing(name, version, config);
  const resolvedVersion = found.version;

  if (found.price === null) {
    const fetched = await fetchAndVerify(name, resolvedVersion, config);
    const summary = renderVerification(name, resolvedVersion, fetched.verification);
    if (fetched.verification.result !== "verified") {
      fetched.cleanup();
      return `${summary}\n  Not installed.`;
    }
    const badge = await publisherBadge(fetched.verification);
    if (badge.refuse) {
      fetched.cleanup();
      log("blocked", { name, version: resolvedVersion, reason: "publisher-agent-revoked" });
      return `${summary}\n${badge.refuse}`;
    }
    const result = await installVerified(
      fetched.skillDir,
      name,
      resolvedVersion,
      fetched.verification.manifestHash ?? "",
      fetched.verification.owner_account ?? "",
    );
    fetched.cleanup();
    return `${summary}\n${badge.line ? `${badge.line}\n` : ""}${result}`;
  }

  // ---- paid flow -----------------------------------------------------------
  if (found.price.asset !== "CCD") throw new Error(`Unsupported asset: ${found.price.asset}`);
  const amount = BigInt(found.price.amountMicroCcd);
  if (amount > 1_000_000n) throw new Error("Price exceeds the 1 CCD product cap (D7)");
  if (!found.payTo) throw new Error("Paid listing has no payTo");

  // 1. Verify the signed listing before any money moves.
  const sigResponse = await fetch(
    `${config.indexUrl.replace(/\/$/, "")}/skills/${name}/${resolvedVersion}/sig.json`,
  );
  if (!sigResponse.ok) throw new Error(`Could not fetch signature: HTTP ${sigResponse.status}`);
  const sig = (await sigResponse.json()) as SignatureFile;
  if (!verifyStatement(sig)) throw new Error("Listing signature is invalid");
  if (sig.statement.manifestHash !== found.manifestHash)
    throw new Error("Listing signature does not match manifestHash");

  // 2. Read and check the 402 requirements.
  const probeBase = config.indexUrl.replace(/\/$/, "");
  const probe = await fetch(`${probeBase}/skills/${name}/${resolvedVersion}/bundle.tgz`);
  if (probe.status !== 402) throw new Error(`Expected 402, got ${probe.status}`);
  const header = probe.headers.get("payment-required");
  if (!header) throw new Error("402 response is missing payment requirements");
  const required = decodePaymentRequiredHeader(header) as { accepts: RequirementOption[] };
  const option = required.accepts?.[0];
  if (!option) throw new Error("No payment option offered");
  assertRequirements(found, option);

  // 3. Reserve under the persisted spend limits before paying.
  await checkAndRecordSpend(name, resolvedVersion, amount, limitsFromEnv());

  // 4. Pay.
  const walletFile =
    process.env.HERMES_WALLET_FILE ?? join(homedir(), ".skillmark", "wallets", "hermes.export");
  const parsed = parseWallet(readFileSync(walletFile, "utf8"));
  const payer = {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
  const client = new x402Client()
    .register(
      "ccd:*",
      new ExactConcordiumScheme({
        accountAddress: AccountAddress.fromBase58(payer.address),
        signer: payer.signer,
      }),
    )
    .setSpendControls({
      allowedAssets: [
        { network: CONCORDIUM_TESTNET_CAIP2, asset: "CCD", maxAmountPerPayment: "1000000" },
      ],
    });
  const pay = wrapFetchWithPayment(fetch, client);

  let response: Response;
  try {
    response = await pay(`${probeBase}/skills/${name}/${resolvedVersion}/bundle.tgz`, {
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    await rollbackSpend(name, resolvedVersion, amount);
    log("pay", { name, version, status: "unknown", error: (error as Error).message });
    return `✕ ${name} ${resolvedVersion} — payment status UNKNOWN\n  The transfer may still be on chain; not retried automatically.\n  ${(error as Error).message}`;
  }
  if (!response.ok) {
    await rollbackSpend(name, resolvedVersion, amount);
    return `✕ ${name} ${resolvedVersion} — payment not settled (HTTP ${response.status}); not installed.`;
  }
  const receiptHeader = response.headers.get("payment-response");
  const receipt = receiptHeader ? decodePaymentResponseHeader(receiptHeader) : undefined;
  if (!receipt?.success || !receipt.transaction) {
    await rollbackSpend(name, resolvedVersion, amount);
    return `✕ ${name} ${resolvedVersion} — no settlement receipt; not installed.`;
  }
  await attachSettlement(name, resolvedVersion, receipt.transaction);
  log("pay", {
    name,
    version: resolvedVersion,
    amountMicroCcd: String(amount),
    txHash: receipt.transaction,
  });

  // 5. Re-verify the paid bytes; a mismatch is refused and logged with the receipt.
  const bytes = Buffer.from(await response.arrayBuffer());
  const extracted = await extractAndVerify(bytes);
  const summary = renderVerification(name, resolvedVersion, extracted.verification);
  if (
    extracted.verification.result !== "verified" ||
    extracted.verification.manifestHash !== found.manifestHash
  ) {
    log("blocked", {
      name,
      version: resolvedVersion,
      result: "tampered-after-payment",
      txHash: receipt.transaction,
    });
    extracted.cleanup();
    return `${summary}\n  ✕ TAMPERED AFTER PAYMENT — not installed.\n  receipt tx ${receipt.transaction}`;
  }
  const badge = await publisherBadge(extracted.verification);
  if (badge.refuse) {
    extracted.cleanup();
    log("blocked", {
      name,
      version: resolvedVersion,
      reason: "publisher-agent-revoked",
      txHash: receipt.transaction,
    });
    return `${summary}\n${badge.refuse}`;
  }
  const installLine = await installVerified(
    extracted.skillDir,
    name,
    resolvedVersion,
    extracted.verification.manifestHash ?? "",
    extracted.verification.owner_account ?? "",
  );
  extracted.cleanup();
  return `${summary}\n${badge.line ? `${badge.line}\n` : ""}  paid ${Number(amount) / 1e6} CCD on delivery · fee sponsored · tx ${receipt.transaction}\n${installLine}`;
}

export { SpendLimitError };
