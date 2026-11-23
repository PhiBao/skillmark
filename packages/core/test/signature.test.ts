import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { jcs } from "../src/canonical.js";
import { loadConfig } from "../src/config.js";
import {
  generateKey,
  keyPath,
  loadKey,
  publicKeyInfo,
  type SigningKey,
  saveKey,
} from "../src/keys.js";
import {
  buildStatement,
  SIGN_DOMAIN,
  signedBytes,
  signStatement,
  verifyStatement,
} from "../src/signature.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-sig-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const statementInput = (key: SigningKey) => ({
  manifestHash: `sha256:${"ab".repeat(32)}`,
  name: "invoice-parser",
  version: "1.0.0",
  key,
});

describe("keys", () => {
  it("generates a key whose public half matches its private half", () => {
    const key = generateKey("t06");
    expect(key.namespace).toBe("skillmark:v1");
    expect(key.key_type).toBe("ed25519");
    expect(key.public_key_hex).toMatch(/^[0-9a-f]{64}$/);
    expect(key.private_key_hex).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(publicKeyInfo(key))).not.toContain(key.private_key_hex);
  });

  it("saves with mode 0600 and loads it back", () => {
    const dir = tempDir();
    const key = generateKey("alice");
    const file = keyPath(dir, "alice");
    saveKey(key, file);
    expect(loadKey(file)).toEqual(key);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("refuses a key file with permissions wider than 0600", () => {
    const dir = tempDir();
    const key = generateKey("loose");
    const file = keyPath(dir, "loose");
    saveKey(key, file);
    chmodSync(file, 0o644);
    expect(() => loadKey(file)).toThrow(/0600/);
    writeFileSync(file, "{}", { mode: 0o600 });
    chmodSync(file, 0o600);
    expect(() => loadKey(file)).toThrow();
  });
});

describe("statement signatures", () => {
  it("signs and verifies a statement", () => {
    const key = generateKey("t06");
    const statement = buildStatement(statementInput(key), loadConfig());
    const sig = signStatement(statement, key);
    expect(sig.schema).toBe("skillmark/sig/v1");
    expect(sig.signature_hex).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyStatement(sig)).toBe(true);
  });

  it("uses exactly the domain tag followed by JCS(statement)", () => {
    const key = generateKey("t06");
    const statement = buildStatement(statementInput(key), loadConfig());
    const expected = Buffer.concat([
      Buffer.from("skillmark/v1/statement\n", "utf8"),
      Buffer.from(jcs(statement), "utf8"),
    ]);
    expect(Buffer.from(signedBytes(statement))).toEqual(expected);
    expect(SIGN_DOMAIN).not.toContain("CIS-8");
    expect(signStatement(statement, key).signature_hex).not.toHaveLength(0);
  });

  it("fails when any signed field is modified", () => {
    const key = generateKey("t06");
    const statement = buildStatement(statementInput(key), loadConfig());
    const sig = signStatement(statement, key);
    const tampered = {
      ...sig,
      statement: { ...statement, manifestHash: `sha256:${"cd".repeat(32)}` },
    };
    expect(verifyStatement(tampered)).toBe(false);
    expect(verifyStatement({ ...sig, signature_hex: "00".repeat(64) })).toBe(false);
    expect(verifyStatement({ ...sig, schema: "other" })).toBe(false);
  });

  it("fills network, cis8, key and issuedAt from the statement builder", () => {
    const key = generateKey("t06");
    const statement = buildStatement(statementInput(key), loadConfig());
    expect(statement.network).toBe("ccd:4221332d34e1694168c2a0c0b3fd0f27");
    expect(statement.cis8).toEqual({ index: 12801, subindex: 0 });
    expect(statement.key).toEqual({
      namespace: "skillmark:v1",
      key_type: "ed25519",
      public_key_hex: key.public_key_hex,
    });
    expect(statement.issuedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("refuses to sign with a mismatched key", () => {
    const key = generateKey("t06");
    const statement = buildStatement(statementInput(key), loadConfig());
    expect(() => signStatement(statement, generateKey("other"))).toThrow(/does not match/);
  });
});
