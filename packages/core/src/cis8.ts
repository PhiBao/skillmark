import {
  AccountAddress,
  ContractAddress,
  Energy,
  Parameter,
  ReceiveName,
} from "@concordium/web-sdk";
import { getClient } from "./chain.js";
import { loadConfig, type NetworkConfig } from "./config.js";

/** CIS-8 entrypoint name confirmed in the T03 spike via getInstanceInfo(<12801,0>). */
export const CIS8_RECEIVE_OWNER_OF_KEY = "CIS-8.ownerOfKey";
export const CIS8_RECEIVE_REGISTER = "CIS-8.registerExternalKey";
export const CIS8_RECEIVE_REVOKE = "CIS-8.revoke";

export interface ExternalKey {
  namespace: string;
  key_type: string;
  public_key_hex: string;
}

/** CIS-8 ExternalKeyId: three u32-LE length-prefixed byte strings. */
export function serializeOwnerOfKeyParam(key: ExternalKey): string {
  const u32 = (n: number) => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(n);
    return buffer;
  };
  const ns = Buffer.from(key.namespace, "utf8");
  const kt = Buffer.from(key.key_type, "utf8");
  const pk = Buffer.from(key.public_key_hex, "hex");
  if (pk.length !== 32) throw new Error("CIS-8 public key must be 32 bytes");
  return Buffer.concat([u32(ns.length), ns, u32(kt.length), kt, u32(pk.length), pk]).toString(
    "hex",
  );
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Buffer) {}
  private take(length: number): Buffer {
    if (this.offset + length > this.bytes.length) throw new Error("Truncated CIS-8 response");
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
  u8(): number {
    return this.take(1)[0];
  }
  u32(): number {
    return this.take(4).readUInt32LE(0);
  }
  u64(): bigint {
    return this.take(8).readBigUInt64LE(0);
  }
  fixed(length: number): Buffer {
    return this.take(length);
  }
  prefixed(): Buffer {
    return this.fixed(this.u32());
  }
  get remaining(): number {
    return this.bytes.length - this.offset;
  }
}

export interface OwnerOfKeyResult {
  found: boolean;
  ownerAccount: string | null;
  status: "Active" | "Revoked" | string | null;
  lastUpdated: string | null;
  key: ExternalKey | null;
  proofScheme: string | null;
  metadata: Array<{ key: string; value: string }>;
  raw: string;
}

/** Parse `ownerOfKey` output: `00` for none, or `01 ‖ Registration` (T03 finding). */
export function parseOwnerOfKeyResponse(rawHex: string): OwnerOfKeyResult {
  const raw = rawHex.toLowerCase();
  const empty: OwnerOfKeyResult = {
    found: false,
    ownerAccount: null,
    status: null,
    lastUpdated: null,
    key: null,
    proofScheme: null,
    metadata: [],
    raw,
  };
  if (raw === "00" || raw === "") return empty;
  const reader = new Reader(Buffer.from(raw, "hex"));
  const present = reader.u8();
  if (present !== 1) throw new Error(`Unexpected CIS-8 ownerOfKey tag: ${present}`);
  const ownerAccount = AccountAddress.fromBuffer(
    Uint8Array.from(reader.fixed(32)).buffer,
  ).toString();
  const key: ExternalKey = {
    namespace: reader.prefixed().toString("utf8"),
    key_type: reader.prefixed().toString("utf8"),
    public_key_hex: reader.prefixed().toString("hex"),
  };
  const proofScheme = reader.prefixed().toString("utf8");
  const count = reader.u32();
  const metadata: Array<{ key: string; value: string }> = [];
  for (let i = 0; i < count; i += 1) {
    metadata.push({
      key: reader.prefixed().toString("utf8"),
      value: reader.prefixed().toString("utf8"),
    });
  }
  const statusByte = reader.u8();
  const status =
    statusByte === 0 ? "Active" : statusByte === 1 ? "Revoked" : `Unknown(${statusByte})`;
  const millis = reader.u64();
  const lastUpdated = millis > 0n ? new Date(Number(millis)).toISOString() : null;
  return { found: true, ownerAccount, status, lastUpdated, key, proofScheme, metadata, raw };
}

/** Direct chain read of CIS-8 `ownerOfKey` — the trust root (D4). */
export async function ownerOfKeyOnChain(
  key: ExternalKey,
  config: NetworkConfig = loadConfig(),
): Promise<OwnerOfKeyResult> {
  const client = getClient(config);
  const invocation = await client.invokeContract({
    contract: ContractAddress.create(config.cis8.index, config.cis8.subindex),
    method: ReceiveName.fromString(CIS8_RECEIVE_OWNER_OF_KEY),
    parameter: Parameter.fromHexString(serializeOwnerOfKeyParam(key)),
    energy: Energy.create(10_000n),
  });
  if (invocation.tag !== "success" || !("returnValue" in invocation) || !invocation.returnValue) {
    throw new Error(`CIS-8 ownerOfKey invocation failed: ${invocation.tag}`);
  }
  const value = invocation.returnValue as unknown as { buffer: Uint8Array } | Uint8Array;
  const bytes = ("buffer" in value ? value.buffer : value) as Uint8Array;
  return parseOwnerOfKeyResponse(Buffer.from(bytes).toString("hex"));
}
