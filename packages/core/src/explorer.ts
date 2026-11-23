import { TESTNET_CAIP2 } from "./config.js";

/** CCDExplorer base, in the same shape as @x402/concordium's getExplorerTxUrl. */
export const TESTNET_EXPLORER = "https://ccdexplorer.io/testnet";

function base(network: string): string {
  if (network !== TESTNET_CAIP2) {
    throw new Error(`Explorer links are testnet-only; got network "${network}"`);
  }
  return TESTNET_EXPLORER;
}

/** Link to a finalized transaction on CCDExplorer testnet. */
export function txUrl(hash: string, network = TESTNET_CAIP2): string {
  return `${base(network)}/transaction/${hash}`;
}

/** Link to an account on CCDExplorer testnet. */
export function accountUrl(address: string, network = TESTNET_CAIP2): string {
  return `${base(network)}/account/${address}`;
}
