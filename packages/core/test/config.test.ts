import { describe, expect, it } from "vitest";
import { loadConfig, MAINNET_CAIP2, readBundledConfig } from "../src/config.js";
import { accountUrl, txUrl } from "../src/explorer.js";

const testnet = () => JSON.parse(JSON.stringify(readBundledConfig())) as Record<string, unknown>;

describe("config loader", () => {
  it("loads the committed testnet config", () => {
    const config = loadConfig(testnet(), {});
    expect(config.network).toBe("testnet");
    expect(config.cis8).toEqual({ index: 12801, subindex: 0 });
    expect(config.cis8004).toEqual({ index: 12802, subindex: 0 });
    expect(config.caip2).toBe("ccd:4221332d34e1694168c2a0c0b3fd0f27");
  });

  it("rejects a mainnet CAIP-2 / network", () => {
    const mainnet = testnet();
    mainnet.caip2 = MAINNET_CAIP2;
    expect(() => loadConfig(mainnet, {})).toThrow();
    const wrongNetwork = testnet();
    wrongNetwork.network = "mainnet";
    expect(() => loadConfig(wrongNetwork, {})).toThrow();
  });

  it("rejects the mainnet CIS-8 and CIS-8004 indices", () => {
    const cis8Mainnet = testnet();
    cis8Mainnet.cis8 = { index: 10081, subindex: 0 };
    expect(() => loadConfig(cis8Mainnet, {})).toThrow(/mainnet/i);

    const cis8004Mainnet = testnet();
    cis8004Mainnet.cis8004 = { index: 10082, subindex: 0 };
    expect(() => loadConfig(cis8004Mainnet, {})).toThrow(/mainnet/i);
  });

  it("rejects a mainnet contract supplied via the environment", () => {
    expect(() => loadConfig(testnet(), { CIS8_CONTRACT: "10081,0" })).toThrow(/testnet/i);
    expect(() => loadConfig(testnet(), { CIS8004_CONTRACT: "10082,0" })).toThrow(/testnet/i);
    expect(() => loadConfig(testnet(), { CCD_NETWORK: "mainnet" })).toThrow();
  });

  it("does not hold state: two loads return independent objects", () => {
    const a = loadConfig(testnet(), {});
    const b = loadConfig(testnet(), {});
    expect(a).not.toBe(b);
  });
});

describe("explorer links", () => {
  const hash = "9a43".repeat(16);
  const address = "3RP7NdeC";

  it("uses the CCDExplorer testnet transaction shape", () => {
    expect(txUrl(hash)).toBe(`https://ccdexplorer.io/testnet/transaction/${hash}`);
  });

  it("uses the CCDExplorer testnet account shape", () => {
    expect(accountUrl(address)).toBe(`https://ccdexplorer.io/testnet/account/${address}`);
  });

  it("refuses non-testnet networks", () => {
    expect(() => txUrl(hash, MAINNET_CAIP2)).toThrow(/testnet-only/);
  });
});
