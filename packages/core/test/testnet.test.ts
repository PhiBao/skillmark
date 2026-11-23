import { describe, expect, it } from "vitest";
import { ownerOfKeyOnChain } from "../src/cis8.js";
import { loadConfig } from "../src/config.js";
import { ownerOfKeyMcp } from "../src/registryMcp.js";

/** The public CIS-8 key registered and revoked in T03; no private key is used here. */
const T03_KEY = {
  namespace: "skillmark:v1",
  key_type: "ed25519",
  public_key_hex: "3b5aa60b010fd005e5ccdb7a6371f6c36e037c621d81b286a9966266772416bd",
};

describe.skipIf(process.env.RUN_TESTNET !== "1")("live testnet (opt-in)", () => {
  it("direct chain read agrees with Registry MCP on owner and status", async () => {
    const config = loadConfig();
    const direct = await ownerOfKeyOnChain(T03_KEY, config);
    const mcp = (await ownerOfKeyMcp(T03_KEY)) as { owner?: string; status?: string };
    expect(direct.found).toBe(true);
    expect(direct.ownerAccount).toBe(mcp.owner);
    expect(direct.status).toBe(mcp.status);
  });

  it("never reports verified for an unknown key", async () => {
    const result = await ownerOfKeyOnChain({ ...T03_KEY, public_key_hex: "11".repeat(32) });
    expect(result.found).toBe(false);
    expect(result.status).toBeNull();
  });
});
