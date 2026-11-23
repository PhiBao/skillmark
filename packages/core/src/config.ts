import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** The only CAIP-2 network id this build accepts (Concordium testnet). */
export const TESTNET_CAIP2 = "ccd:4221332d34e1694168c2a0c0b3fd0f27";
/** Mainnet ids — rejected outright, anywhere in config or env. */
export const MAINNET_CIS8_INDEX = 10081;
export const MAINNET_CIS8004_INDEX = 10082;
export const MAINNET_CAIP2 = "ccd:9dd9ca4d19e9393877d2c44b70f89acb";

const contractSchema = z.object({
  index: z.number().int().nonnegative(),
  subindex: z.number().int().nonnegative(),
});

export const networkConfigSchema = z
  .object({
    network: z.literal("testnet"),
    grpcHost: z.string().min(1),
    grpcPort: z.number().int().positive(),
    caip2: z.literal(TESTNET_CAIP2),
    genesisHash: z.string().regex(/^[0-9a-f]{64}$/),
    cis8: contractSchema,
    cis8004: contractSchema,
    registryMcpUrl: z.string().url(),
  })
  .superRefine((value, ctx) => {
    if (value.cis8.index === MAINNET_CIS8_INDEX) {
      ctx.addIssue({
        code: "custom",
        message: "CIS-8 is the mainnet contract",
        path: ["cis8", "index"],
      });
    }
    if (value.cis8004.index === MAINNET_CIS8004_INDEX) {
      ctx.addIssue({
        code: "custom",
        message: "CIS-8004 is the mainnet contract",
        path: ["cis8004", "index"],
      });
    }
  });

export type NetworkConfig = z.infer<typeof networkConfigSchema>;

/** Walk up from this module to the workspace root so config works from src, dist or tests. */
export function findRepoRoot(start = dirname(fileURLToPath(import.meta.url))): string {
  let dir = start;
  for (;;) {
    try {
      const marker = join(dir, "pnpm-workspace.yaml");
      readFileSync(marker);
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error("Could not find workspace root (pnpm-workspace.yaml)");
      dir = parent;
    }
  }
}

/** Read the committed testnet config from disk. */
export function readBundledConfig(): unknown {
  const file = join(findRepoRoot(), "config", "testnet.json");
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function parseContractEnv(value: string, label: string): { index: number; subindex: number } {
  const match = /^(\d+),(\d+)$/.exec(value.trim());
  if (!match) throw new Error(`${label} must be "<index>,<subindex>", got "${value}"`);
  return { index: Number(match[1]), subindex: Number(match[2]) };
}

/**
 * Load and validate configuration. Throws on any mainnet id or on a mismatch
 * between the committed config and the environment. Never defaults to mainnet.
 */
export function loadConfig(
  raw: unknown = readBundledConfig(),
  env: NodeJS.ProcessEnv = process.env,
): NetworkConfig {
  const config = networkConfigSchema.parse(raw);

  if (env.CCD_NETWORK !== undefined && env.CCD_NETWORK !== "testnet") {
    throw new Error(`CCD_NETWORK must be "testnet", got "${env.CCD_NETWORK}"`);
  }
  if (env.CCD_NETWORK !== undefined && env.CCD_NETWORK !== config.network) {
    throw new Error("CCD_NETWORK does not match config/testnet.json");
  }
  if (env.CCD_CAIP2 !== undefined && env.CCD_CAIP2 !== TESTNET_CAIP2) {
    throw new Error(`CCD_CAIP2 must be ${TESTNET_CAIP2}, got "${env.CCD_CAIP2}"`);
  }
  if (env.CIS8_CONTRACT !== undefined) {
    const cis8 = parseContractEnv(env.CIS8_CONTRACT, "CIS8_CONTRACT");
    if (cis8.index === MAINNET_CIS8_INDEX || cis8.index !== config.cis8.index) {
      throw new Error(`CIS8_CONTRACT is not the testnet CIS-8 contract: ${env.CIS8_CONTRACT}`);
    }
  }
  if (env.CIS8004_CONTRACT !== undefined) {
    const cis8004 = parseContractEnv(env.CIS8004_CONTRACT, "CIS8004_CONTRACT");
    if (cis8004.index === MAINNET_CIS8004_INDEX || cis8004.index !== config.cis8004.index) {
      throw new Error(
        `CIS8004_CONTRACT is not the testnet CIS-8004 contract: ${env.CIS8004_CONTRACT}`,
      );
    }
  }
  return config;
}
