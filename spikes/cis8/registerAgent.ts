/** T03 spike B, part 5: CIS-8004 agent for hermes via Cis8 external_reference, then check_badge. */
import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/curves/utils.js";
import { KEY_TYPE, mcp, NAMESPACE, saveState, submitContract, wallet } from "./registerKey.ts";

/** Temporarily host a card as an httpbin base64 echo: the served bytes are exactly the input. */
function hostCard(cardJson: string): string {
  return `https://httpbin.org/base64/${Buffer.from(cardJson, "utf8").toString("base64")}`;
}

async function registerHermesKey(): Promise<string> {
  const hermes = wallet("hermes").address;
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKeyHex = bytesToHex(ed25519.getPublicKey(privateKey));
  const canonical = await mcp("build_cis8_canonical_bytes", {
    concordium_account: hermes,
    external_namespace: NAMESPACE,
    external_key_namespace: NAMESPACE,
    external_key_type: KEY_TYPE,
    external_public_key_hex: publicKeyHex,
    proof_scheme: "solana-ed25519",
  });
  const proofSignatureHex = bytesToHex(
    ed25519.sign(Buffer.from(canonical.bytes_hex, "hex"), privateKey),
  );
  const build = await mcp("build_cis8_register", {
    external_key: { namespace: NAMESPACE, key_type: KEY_TYPE, public_key_hex: publicKeyHex },
    proof: { scheme: "solana-ed25519", signature_hex: proofSignatureHex },
    metadata: [
      { key: "purpose", value: "skillmark-signing" },
      { key: "label", value: "hermes-t03" },
    ],
    sender: hermes,
  });
  const tx = await submitContract(build, "hermes");
  return publicKeyHex;
}

async function main(): Promise<void> {
  const hermes = wallet("hermes").address;
  const publicKeyHex = await registerHermesKey();

  // Pre-mint card (token_id null). Host the exact bytes at a temporary public URL.
  const card = await mcp("build_agent_card", {
    name: "Hermes Skillmark",
    description: "Hermes agent for the Skillmark demo — verifies and installs signed skills.",
    agent_uri: "https://example.invalid/agent-card.json",
    owner_account: hermes,
    token_id: null,
    version: "1.0.0",
    skills: [
      { id: "skillmark", name: "Skillmark", description: "Verify and install signed skills" },
    ],
    services: { skillmarkMcp: "skillmark", indexUrl: "https://skillmark-index.onrender.com" },
  });
  const cardJson = card.agent_card_json as string;
  const hashFromTool = card.metadata_hash_hex as string;
  const hashLocally = createHash("sha256").update(cardJson, "utf8").digest("hex");
  // A ~2.8 KB httpbin URL made CIS-8004.register fail with RejectedReceive(-2147483648).
  // The spike pins a short placeholder URI; T17 hosts the full card on the index.
  const cardUrl = "https://example.invalid/agent-card.json";
  const hostedFullCardUrl = hostCard(cardJson);

  const build = await mcp("build_register", {
    sender: hermes,
    agent_uri: cardUrl,
    metadata_hash_hex: hashFromTool,
    external_reference: {
      kind: "Cis8",
      contract_address: { index: 12801, subindex: 0 },
      key: { namespace: NAMESPACE, key_type: KEY_TYPE, public_key_hex: publicKeyHex },
    },
  });
  console.log("build_register output:", JSON.stringify(build, null, 2));
  const agentTx = await submitContract(build, "hermes");

  // Minted token id: find the agent by its Cis8 external reference.
  const agent = await mcp("agent_by_external_reference", {
    external_reference: {
      kind: "Cis8",
      contract_address: { index: 12801, subindex: 0 },
      key: { namespace: NAMESPACE, key_type: KEY_TYPE, public_key_hex: publicKeyHex },
    },
  });
  const tokenId = agent?.token_id !== undefined ? String(agent.token_id) : undefined;
  const badge = agent?.token_address ?? undefined;

  const badgeCheck = badge
    ? await mcp("check_badge", { id: badge })
    : await mcp("check_badge", { id: hermes });
  const cardVerification = tokenId
    ? await mcp("verify_agent_card", { token_id: tokenId, fetch: true })
    : null;

  saveState({
    agentTx,
    tokenId,
    badge,
    agent: {
      cardUrl,
      hostedFullCardUrl,
      hashFromTool,
      hashLocally,
      agent,
      badgeCheck,
      cardVerification,
    },
  });
  console.log(
    JSON.stringify(
      {
        agentTx,
        publicKeyHex,
        tokenId,
        badge,
        cardUrl,
        hostedFullCardUrl,
        hashFromTool,
        hashLocally,
        agent,
        badgeCheck,
        cardVerification,
      },
      null,
      2,
    ),
  );
}

await main();
