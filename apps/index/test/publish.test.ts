import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c as pack } from "tar";
import { afterEach, describe, expect, it } from "vitest";
import { generateKey } from "../../../packages/core/src/keys.ts";
import { buildManifest } from "../../../packages/core/src/manifest.ts";
import { buildStatement, signStatement } from "../../../packages/core/src/signature.ts";
import { SIGNATURE_FILE } from "../../../packages/core/src/types.ts";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import { createApp } from "../src/server.ts";
import { openStore } from "../src/store.ts";

const dirs: string[] = [];
let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
afterEach(() => {
  if (server) server.close();
  server = undefined;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const OWNER = "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q";
const reader: RegistryReader = {
  ownerOfKeyOnChain: async () => ({
    found: true,
    ownerAccount: OWNER,
    status: "Active",
    lastUpdated: "2026-11-23T07:00:00.000Z",
  }),
  ownerOfKeyMcp: async () => ({ owner: OWNER, status: "Active" }),
  checkBadge: async () => ({ agents: [] }),
};

async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "skillmark-publish-test-"));
  dirs.push(dataDir);
  const app = createApp({ store: openStore(dataDir), dataDir, registryReader: reader });
  const listener = app.listen(0, "127.0.0.1");
  server = listener;
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  return `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
}

async function signedSkill(
  withSymlink = false,
): Promise<{ dir: string; bundle: Buffer; manifestHash: string }> {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-publish-skill-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "SKILL.md"),
    "---\nname: invoice-parser\ndescription: Parse invoices.\nversion: 1.0.0\n---\n# Parser\n",
  );
  const key = generateKey("publish-test");
  const { manifestHash } = await buildManifest(dir);
  const statement = buildStatement({ manifestHash, name: "invoice-parser", version: "1.0.0", key });
  writeFileSync(join(dir, SIGNATURE_FILE), JSON.stringify(signStatement(statement, key)));
  if (withSymlink) symlinkSync("/etc/passwd", join(dir, "leak.txt"));
  const bundlePath = join(dir, "..", `${key.label}.tgz`);
  dirs.push(bundlePath);
  await pack({ gzip: true, cwd: dir, file: bundlePath }, ["./"]);
  return { dir, bundle: readFileSync(bundlePath), manifestHash };
}

function form(
  bundle: Buffer,
  manifestHash = "ignored",
  overrides: Record<string, unknown> = {},
): FormData {
  const form = new FormData();
  form.set("bundle", new Blob([bundle], { type: "application/gzip" }), "bundle.tgz");
  form.set(
    "listing",
    JSON.stringify({
      name: "invoice-parser",
      version: "1.0.0",
      description: "Parse invoices.",
      manifestHash,
      price: null,
      payTo: null,
      ...overrides,
    }),
  );
  return form;
}

describe("POST /api/publish", () => {
  it("stores a valid verified bundle and returns 201", async () => {
    const base = await setup();
    const { bundle, manifestHash } = await signedSkill();
    const response = await fetch(`${base}/api/publish`, {
      method: "POST",
      body: form(bundle, manifestHash),
    });
    if (response.status !== 201) console.log("publish response:", await response.text());
    expect(response.status).toBe(201);
    const index = (await (await fetch(`${base}/.well-known/skills/index.json`)).json()) as any;
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects a tampered bundle with 422 tampered", async () => {
    const base = await setup();
    const { dir, bundle } = await signedSkill();
    void bundle;
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: invoice-parser\ndescription: Changed.\nversion: 1.0.0\n---\n# Changed\n",
    );
    const tamperedPath = join(dir, "..", "tampered.tgz");
    dirs.push(tamperedPath);
    await pack({ gzip: true, cwd: dir, file: tamperedPath }, ["./"]);
    const response = await fetch(`${base}/api/publish`, {
      method: "POST",
      body: form(readFileSync(tamperedPath)),
    });
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toBe("tampered");
  });

  it("rejects a symlink in the tarball with 400", async () => {
    const base = await setup();
    const { bundle } = await signedSkill(true);
    const response = await fetch(`${base}/api/publish`, { method: "POST", body: form(bundle) });
    expect(response.status).toBe(400);
  });

  it("rejects an oversized decompressed bundle", async () => {
    const base = await setup();
    const dir = mkdtempSync(join(tmpdir(), "skillmark-bomb-"));
    dirs.push(dir);
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: bomb\ndescription: x\nversion: 1.0.0\n---\n# Bomb\n",
    );
    writeFileSync(join(dir, "big.bin"), Buffer.alloc(60 * 1024 * 1024, 0));
    const bombPath = join(dir, "..", "bomb.tgz");
    dirs.push(bombPath);
    await pack({ gzip: true, cwd: dir, file: bombPath }, ["./"]);
    const response = await fetch(`${base}/api/publish`, {
      method: "POST",
      body: form(readFileSync(bombPath)),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a listing that conflicts with the signed statement", async () => {
    const base = await setup();
    const { bundle, manifestHash } = await signedSkill();
    const response = await fetch(`${base}/api/publish`, {
      method: "POST",
      body: form(bundle, manifestHash, { name: "other-name" }),
    });
    expect(response.status).toBe(400);
  });
});
