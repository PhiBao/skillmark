/** T03 spike B, part 2: read ownerOfKey via Registry MCP and direct gRPC invokeContract. */
import { ContractAddress, Energy, Parameter, ReceiveName } from "@concordium/web-sdk";
import { grpc, KEY_TYPE, loadState, mcp, NAMESPACE, saveState } from "./registerKey.ts";

/** CIS-8 ExternalKeyId: three u32-LE length-prefixed byte strings. */
export function serializeOwnerOfKeyParam(publicKeyHex: string): string {
  const le = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  const ns = Buffer.from(NAMESPACE, "utf8");
  const kt = Buffer.from(KEY_TYPE, "utf8");
  const pk = Buffer.from(publicKeyHex, "hex");
  return Buffer.concat([le(ns.length), ns, le(kt.length), kt, le(pk.length), pk]).toString("hex");
}

export interface OwnerRead {
  mcp: unknown;
  direct: {
    tag: string;
    returnValueHex: string | null;
    failure: string | null;
    usedEnergy: string | null;
  };
}

export async function readOwner(publicKeyHex: string): Promise<OwnerRead> {
  const mcpResult = await mcp("owner_of_key", {
    external_key: { namespace: NAMESPACE, key_type: KEY_TYPE, public_key_hex: publicKeyHex },
  });
  const invocation = await grpc.invokeContract({
    contract: ContractAddress.create(12801n, 0n),
    method: ReceiveName.fromString("CIS-8.ownerOfKey"),
    parameter: Parameter.fromHexString(serializeOwnerOfKeyParam(publicKeyHex)),
    energy: Energy.create(10000n),
  });
  return {
    mcp: mcpResult,
    direct: {
      tag: invocation.tag,
      returnValueHex:
        "returnValue" in invocation && invocation.returnValue
          ? Buffer.from((invocation.returnValue as any).buffer ?? invocation.returnValue).toString(
              "hex",
            )
          : null,
      failure: "failure" in invocation && invocation.failure ? String(invocation.failure) : null,
      usedEnergy: "usedEnergy" in invocation ? invocation.usedEnergy.toString() : null,
    },
  };
}

async function main(): Promise<void> {
  const state = loadState();
  const result = await readOwner(state.publicKeyHex);
  saveState({ ownerBefore: result });
  console.log(
    JSON.stringify(
      { phase: "before-revoke", publicKeyHex: state.publicKeyHex, ...result },
      null,
      2,
    ),
  );
}

if (process.argv[1]?.endsWith("ownerOf.ts")) await main();
