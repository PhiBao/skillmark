/**
 * T17: register the Hermes agent in CIS-8004 and pin its card hash.
 *
 * Steps (run in this order, deploying the index between `card` and `pin`):
 *   pnpm tsx scripts/register-hermes.ts key
 *   pnpm tsx scripts/register-hermes.ts card
 *   pnpm tsx scripts/register-hermes.ts register
 *   pnpm tsx scripts/register-hermes.ts card --token <id>
 *   pnpm tsx scripts/register-hermes.ts pin <id>
 *   pnpm tsx scripts/register-hermes.ts check <badge>
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AccountAddress,
  buildBasicAccountSigner,
  CcdAmount,
  ContractAddress,
  Energy,
  Parameter,
  parseWallet,
  ReceiveName,
  SequenceNumber,
  Transaction,
  TransactionExpiry,
} from "@concordium/web-sdk";
import { nextNonce, sendAndFinalize } from "../packages/core/src/chain.ts";
import { signCis8Proof } from "../packages/core/src/cis8.ts";
import { loadConfig } from "../packages/core/src/config.ts";
import {
  generateKey,
  KEY_TYPE,
  keyPath,
  loadKey,
  SKILLMARK_NAMESPACE,
  saveKey,
} from "../packages/core/src/keys.ts";
import {
  agentByExternalReference,
  buildAgentCard,
  buildCis8CanonicalBytes,
  buildRegister,
  buildRegisterTx,
  buildSetAgentUri,
  checkBadge,
  ownerOfKeyMcp,
} from "../packages/core/src/registryMcp.ts";

const config = loadConfig();
const repoRoot = new URL("..", import.meta.url).pathname;
const cardFile = join(repoRoot, "config", "hermes-agent-card.json");
const accountsFile = join(repoRoot, "config", "testnet.accounts.json");
const indexUrl = process.env.INDEX_PUBLIC_URL ?? "https://skillmark-index.onrender.com";
const cardUrl = `${indexUrl.replace(/\/$/, "")}/agents/hermes/agent-card.json`;
const keyFile =
  process.env.HERMES_SIGNING_KEY_FILE ?? join(homedir(), ".skillmark", "keys", "hermes.json");

function wallet() {
  const file =
    process.env.HERMES_WALLET_FILE ?? join(homedir(), ".skillmark", "wallets", "hermes.export");
  const parsed = parseWallet(readFileSync(file, "utf8"));
  return {
    address: parsed.value.address,
    signer: buildBasicAccountSigner(parsed.value.accountKeys.keys[0].keys[0].signKey),
  };
}

async function submit(build: {
  contract_address: { index: number; subindex: number };
  receive_name: string;
  parameter_hex: string;
  suggested_energy: number;
}) {
  const w = wallet();
  const sender = AccountAddress.fromBase58(w.address);
  const tx = Transaction.updateContract(
    {
      amount: CcdAmount.fromMicroCcd(0n),
      address: ContractAddress.create(
        build.contract_address.index,
        build.contract_address.subindex,
      ),
      receiveName: ReceiveName.fromString(build.receive_name),
      message: Parameter.fromHexString(build.parameter_hex),
    },
    Energy.create(build.suggested_energy),
  )
    .addMetadata({
      sender,
      nonce: SequenceNumber.create(await nextNonce(sender, config)),
      expiry: TransactionExpiry.futureMinutes(10),
    })
    .build();
  const sent = await sendAndFinalize(tx, { address: sender, signer: w.signer }, config);
  return sent.txHash;
}

function externalReference(publicKeyHex: string) {
  return {
    kind: "Cis8",
    contract_address: { index: config.cis8.index, subindex: config.cis8.subindex },
    key: { namespace: SKILLMARK_NAMESPACE, key_type: KEY_TYPE, public_key_hex: publicKeyHex },
  };
}

async function ensureKey(): Promise<string> {
  const file = keyPath(
    process.env.SKILLMARK_KEYS_DIR ?? join(homedir(), ".skillmark", "keys"),
    "hermes",
  );
  const key = existsSync(file) ? loadKey(file) : generateKey("hermes");
  if (!existsSync(file)) saveKey(key, file);
  const existing = (await ownerOfKeyMcp(
    { namespace: SKILLMARK_NAMESPACE, key_type: KEY_TYPE, public_key_hex: key.public_key_hex },
    { config },
  )) as { status?: string } | null;
  if (existing?.status === "Active") {
    console.log(`hermes key already active: ${key.public_key_hex}`);
    return key.public_key_hex;
  }
  const w = wallet();
  const canonical = await buildCis8CanonicalBytes(
    {
      concordium_account: w.address,
      external_namespace: SKILLMARK_NAMESPACE,
      external_key_namespace: SKILLMARK_NAMESPACE,
      external_key_type: KEY_TYPE,
      external_public_key_hex: key.public_key_hex,
      proof_scheme: "solana-ed25519",
    },
    { config },
  );
  const build = await buildRegisterTx(
    {
      external_key: {
        namespace: SKILLMARK_NAMESPACE,
        key_type: KEY_TYPE,
        public_key_hex: key.public_key_hex,
      },
      proof: {
        scheme: "solana-ed25519",
        signature_hex: signCis8Proof(canonical.bytes_hex, key.private_key_hex),
      },
      metadata: [
        { key: "purpose", value: "skillmark-signing" },
        { key: "label", value: "hermes" },
      ],
      sender: w.address,
    },
    { config },
  );
  const tx = await submit(build);
  console.log(`hermes key registered: ${key.public_key_hex} tx ${tx}`);
  return key.public_key_hex;
}

const keyFilePublic = () => loadKey(keyFile).public_key_hex;

async function buildCard(tokenId?: string): Promise<string> {
  const card = await buildAgentCard(
    {
      name: "Hermes Skillmark",
      description:
        "Hermes agent that verifies and installs Skillmark-signed skills. x402 payments supported.",
      agent_uri: cardUrl,
      owner_account: wallet().address,
      token_id: tokenId ?? null,
      version: "1.0.0",
      skills: [
        {
          id: "skillmark",
          name: "Skillmark",
          description: "Verify, install and audit signed skills",
        },
      ],
      services: { skillmarkMcp: "skillmark", indexUrl },
      documentation_url: `${indexUrl.replace(/\/$/, "")}/llms.txt`,
    },
    { config },
  );
  const parsedCard = JSON.parse(card.agent_card_json as string) as Record<string, unknown>;
  parsedCard.x402Support = true;
  const json = `${JSON.stringify(parsedCard, null, 2)}\n`;
  writeFileSync(cardFile, json);
  const hash = createHash("sha256").update(json, "utf8").digest("hex");
  console.log(
    JSON.stringify(
      { cardUrl, file: cardFile, metadataHashHex: hash },
      null,
      2,
    ),
  );
  return hash;
}

async function registerAgent(): Promise<void> {
  const publicKeyHex = keyFilePublic();
  const hash = createHash("sha256").update(readFileSync(cardFile)).digest("hex");
  const build = await buildRegister(
    {
      sender: wallet().address,
      agent_uri: cardUrl,
      metadata_hash_hex: hash,
      external_reference: externalReference(publicKeyHex),
    },
    { config },
  );
  const tx = await submit(build);
  const agent = await agentByExternalReference(externalReference(publicKeyHex), { config });
  const accounts = JSON.parse(readFileSync(accountsFile, "utf8"));
  accounts.hermesAgentTokenId = String(agent.token_id);
  accounts.hermesBadge = agent.token_address;
  accounts.hermesAgentTx = tx;
  writeFileSync(accountsFile, `${JSON.stringify(accounts, null, 2)}\n`);
  console.log(JSON.stringify({ tx, tokenId: agent.token_id, badge: agent.token_address }, null, 2));
}

async function pin(tokenId: string): Promise<void> {
  const hash = createHash("sha256").update(readFileSync(cardFile)).digest("hex");
  const build = await buildSetAgentUri(
    { sender: wallet().address, token_id: tokenId, agent_uri: cardUrl, metadata_hash_hex: hash },
    { config },
  );
  const tx = await submit(build);
  console.log(JSON.stringify({ tx, tokenId, metadataHashHex: hash }, null, 2));
}

async function check(badge: string): Promise<void> {
  const result = await checkBadge(badge, { config });
  console.log(JSON.stringify(result, null, 2));
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case "key":
    await ensureKey();
    break;
  case "card":
    await buildCard(arg);
    break;
  case "register":
    await registerAgent();
    break;
  case "pin":
    if (!arg) throw new Error("usage: register-hermes.ts pin <tokenId>");
    await pin(arg);
    break;
  case "check":
    if (!arg) throw new Error("usage: register-hermes.ts check <badge>");
    await check(arg);
    break;
  default:
    console.log(
      "usage: register-hermes.ts key|card [tokenId]|register|pin <tokenId>|check <badge>",
    );
}
