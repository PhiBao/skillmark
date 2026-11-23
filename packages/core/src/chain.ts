import {
  AccountAddress,
  type AccountSigner,
  Transaction,
  type TransactionHash,
} from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import { loadConfig, type NetworkConfig } from "./config.js";

/** Clients cached by endpoint. Only the connection object is cached — no secrets or chain state in module scope (A§8). */
const clients = new Map<string, ConcordiumGRPCNodeClient>();

export function getClient(config: NetworkConfig = loadConfig()): ConcordiumGRPCNodeClient {
  const key = `${config.grpcHost}:${config.grpcPort}`;
  let client = clients.get(key);
  if (!client) {
    client = new ConcordiumGRPCNodeClient(
      config.grpcHost,
      config.grpcPort,
      credentials.createSsl(),
    );
    clients.set(key, client);
  }
  return client;
}

/** A built transaction ready to be signed, as accepted by the SDK. */
export type SignableTx = Parameters<typeof Transaction.signAndFinalize>[0];

export interface WalletSigner {
  address: string | AccountAddress.Type;
  signer: AccountSigner;
}

export interface SentTransaction {
  txHash: string;
  status: "finalized" | "committed";
}

/** Sign a sign-ready transaction with the wallet and wait for finalization. */
export async function sendAndFinalize(
  tx: SignableTx,
  wallet: WalletSigner,
  config: NetworkConfig = loadConfig(),
): Promise<SentTransaction> {
  const client = getClient(config);
  const finalized = await Transaction.signAndFinalize(tx, wallet.signer);
  const hash: TransactionHash.Type = await client.sendTransaction(finalized);
  // waitForTransactionFinalization only resolves after finality.
  await client.waitForTransactionFinalization(hash);
  return { txHash: hash.toString(), status: "finalized" as const };
}

/** Read the next nonce for an account. */
export async function nextNonce(
  address: string | AccountAddress.Type,
  config?: NetworkConfig,
): Promise<bigint> {
  const account = typeof address === "string" ? AccountAddress.fromBase58(address) : address;
  const result = await getClient(config).getNextAccountNonce(account);
  return BigInt(result.nonce.toString());
}
