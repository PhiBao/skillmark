import type { ExternalKey } from "./cis8.js";
import { loadConfig, type NetworkConfig } from "./config.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;

export interface RegistryCallOptions {
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  config?: NetworkConfig;
}

/** Minimal JSON-RPC client for the Concordium Registry MCP. Always pins network: "testnet". */
export async function registryCall<T = any>(
  name: string,
  args: Record<string, unknown>,
  options: RegistryCallOptions = {},
): Promise<T> {
  const config = options.config ?? loadConfig();
  const url = config.registryMcpUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name, arguments: { ...args, network: config.network } },
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const parsed = (await response.json()) as any;
      if (parsed.error) throw new Error(`${name}: ${JSON.stringify(parsed.error)}`);
      const text: string | undefined = parsed.result?.content?.[0]?.text;
      if (!text) throw new Error(`${name}: empty tool result`);
      if (parsed.result?.isError) throw new Error(`${name}: ${text}`);
      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof Error && /fetch|timeout|abort|network|timedout/i.test(error.message);
      if (!retryable || attempt === retries) break;
    }
  }
  throw lastError;
}

export interface RegisterBuild {
  contract_address: { index: number; subindex: number };
  receive_name: string;
  parameter_json: unknown;
  parameter_hex: string;
  suggested_energy: number;
  sender: string;
}

export interface CanonicalBytes {
  network: string;
  byte_length: number;
  bytes_hex: string;
  contract_address: { index: number; subindex: number };
  genesis_hash: string;
  prefix_utf8: string;
}

/** Sign-ready MCP payload for CIS-8 registerExternalKey. */
export function buildRegisterTx(
  args: {
    external_key: ExternalKey;
    proof: { scheme: string; signature_hex: string };
    metadata?: Array<{ key: string; value: string }>;
    sender: string;
  },
  options?: RegistryCallOptions,
): Promise<RegisterBuild> {
  return registryCall<RegisterBuild>(
    "build_cis8_register",
    args as unknown as Record<string, unknown>,
    options,
  );
}

/** Sign-ready MCP payload for CIS-8 revoke. */
export function buildRevokeTx(
  args: { identifier: ExternalKey; sender: string },
  options?: RegistryCallOptions,
): Promise<RegisterBuild> {
  return registryCall<RegisterBuild>(
    "build_cis8_revoke",
    args as unknown as Record<string, unknown>,
    options,
  );
}

export function buildCis8CanonicalBytes(
  args: {
    concordium_account: string;
    external_namespace: string;
    external_key_namespace: string;
    external_key_type: string;
    external_public_key_hex: string;
    proof_scheme: string;
  },
  options?: RegistryCallOptions,
): Promise<CanonicalBytes> {
  return registryCall<CanonicalBytes>(
    "build_cis8_canonical_bytes",
    args as unknown as Record<string, unknown>,
    options,
  );
}

export function ownerOfKeyMcp(key: ExternalKey, options?: RegistryCallOptions): Promise<unknown> {
  return registryCall("owner_of_key", { external_key: key }, options);
}

export function contractInfo(options?: RegistryCallOptions): Promise<unknown> {
  return registryCall("contract_info", {}, options);
}

export function checkBadge(id: string, options?: RegistryCallOptions): Promise<unknown> {
  return registryCall("check_badge", { id }, options);
}

export function verifyAgentCard(
  tokenId: string | number,
  options?: RegistryCallOptions,
): Promise<unknown> {
  return registryCall("verify_agent_card", { token_id: tokenId, fetch: true }, options);
}
