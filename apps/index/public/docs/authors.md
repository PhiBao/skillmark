# Publish a skill

Skillmark publishes agentskills.io-style directories (`SKILL.md` plus optional files). Prices are capped at 1 CCD; testnet only.

## 1. Make a signing key

```bash
skillmark keygen alice
```

The key file is written under `~/.skillmark/keys/` with mode 0600. It is separate from your Concordium account key, so it can be revoked without touching the account.

## 2. Bind the key to your Concordium account

```bash
skillmark register-key alice
```

This calls the Concordium Registry MCP for the canonical bytes, signs them, and submits `CIS-8.registerExternalKey` from your publisher account. It prints a CCDExplorer link.

## 3. Sign the exact contents

```bash
skillmark sign ./my-skill --key alice
```

This writes `skillmark.sig.json` next to `SKILL.md`. The signature covers a canonical manifest of every file.

## 4. Publish

Free:

```bash
skillmark publish ./my-skill --index https://skillmark-index.onrender.com
```

Paid (paid skills install only through the MCP, because native Hermes cannot do x402):

```bash
skillmark publish ./my-skill --index https://skillmark-index.onrender.com --price 0.5 --pay-to <your-account>
```

The index re-verifies the bundle and refuses anything that is not `verified`.

## 5. Revoke

```bash
skillmark revoke alice
```

One transaction. Hermes agents running `audit_installed` quarantine the skill on their next audit.

## Limits

Identity limits damage; it does not prove the skill is safe. The Hermes scanner still decides “dangerous”. Testnet identities are test identities, not real KYC.
