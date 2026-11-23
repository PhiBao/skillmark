import { describe, expect, it, vi } from "vitest";
import { parseOwnerOfKeyResponse, serializeOwnerOfKeyParam } from "../src/cis8.js";
import { registryCall } from "../src/registryMcp.js";

const KEY = {
  namespace: "skillmark:v1",
  key_type: "ed25519",
  public_key_hex: "3b5aa60b010fd005e5ccdb7a6371f6c36e037c621d81b286a9966266772416bd",
};
const ALICE = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";

/** Byte fixtures captured in T03 RESULT.md from direct CIS-8 ownerOfKey invocation. */
const REGISTRATION_PREFIX =
  "0195d82dbfc95eb93a1c729b22aa1ce76907affd9f2c0ec8b5289edb0e0fe14c30" +
  "0c000000736b696c6c6d61726b3a76310700000065643235353139200000003b5aa60b010fd005e5ccdb7a6371f6c36e037c621d81b286a9966266772416bd" +
  "0e000000736f6c616e612d65643235353139" +
  "02000000050000006c6162656c090000007430332d7370696b6507000000707572706f736511000000736b696c6c6d61726b2d7369676e696e67";
const ACTIVE = `${REGISTRATION_PREFIX}00cf9d4507a2010000`;
const REVOKED = `${REGISTRATION_PREFIX}010fbd4507a2010000`;

describe("serializeOwnerOfKeyParam", () => {
  it("matches the T03 byte fixture", () => {
    expect(serializeOwnerOfKeyParam(KEY)).toBe(
      "0c000000736b696c6c6d61726b3a76310700000065643235353139200000003b5aa60b010fd005e5ccdb7a6371f6c36e037c621d81b286a9966266772416bd",
    );
  });
  it("rejects a non-32-byte public key", () => {
    expect(() => serializeOwnerOfKeyParam({ ...KEY, public_key_hex: "00" })).toThrow(/32 bytes/);
  });
});

describe("parseOwnerOfKeyResponse", () => {
  it("parses the no-registration response", () => {
    expect(parseOwnerOfKeyResponse("00")).toMatchObject({
      found: false,
      status: null,
      ownerAccount: null,
    });
  });
  it("parses an Active registration", () => {
    const result = parseOwnerOfKeyResponse(ACTIVE);
    expect(result).toMatchObject({
      found: true,
      ownerAccount: ALICE,
      status: "Active",
      key: KEY,
      proofScheme: "solana-ed25519",
      lastUpdated: "2026-11-23T07:18:52.623Z",
    });
    expect(result.metadata).toEqual([
      { key: "label", value: "t03-spike" },
      { key: "purpose", value: "skillmark-signing" },
    ]);
  });
  it("parses a Revoked registration — T03 proved it is 1+Revoked, not 0", () => {
    expect(parseOwnerOfKeyResponse(REVOKED)).toMatchObject({
      found: true,
      ownerAccount: ALICE,
      status: "Revoked",
      lastUpdated: "2026-11-23T07:19:00.623Z",
    });
  });
  it("rejects a truncated response", () => {
    expect(() => parseOwnerOfKeyResponse("01ff")).toThrow(/Truncated/);
  });
});

describe("registryMcp client", () => {
  const toolResponse = (text: string) => ({
    json: async () => ({ result: { content: [{ type: "text", text }], isError: false } }),
  });

  it("always sends network: testnet", async () => {
    const fetchImpl = vi.fn(async () =>
      toolResponse(JSON.stringify({ ok: true })),
    ) as unknown as typeof fetch;
    const result = await registryCall("contract_info", {}, { fetchImpl });
    expect(result).toEqual({ ok: true });
    const body = JSON.parse(String((fetchImpl as any).mock.calls[0][1].body));
    expect(body.params.arguments.network).toBe("testnet");
  });

  it("retries a transient fetch failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(toolResponse(JSON.stringify({ ok: 2 }))) as unknown as typeof fetch;
    const result = await registryCall("owner_of_key", { external_key: KEY }, { fetchImpl });
    expect(result).toEqual({ ok: 2 });
    expect((fetchImpl as any).mock.calls.length).toBe(2);
  });

  it("does not retry a tool error", async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({
        result: { content: [{ type: "text", text: "bad argument" }], isError: true },
      }),
    })) as unknown as typeof fetch;
    await expect(registryCall("owner_of_key", {}, { fetchImpl })).rejects.toThrow(/bad argument/);
    expect((fetchImpl as any).mock.calls.length).toBe(1);
  });
});
