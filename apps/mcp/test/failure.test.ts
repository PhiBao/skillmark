import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c as pack } from "tar";
import { afterEach, describe, expect, it } from "vitest";
import { generateKey } from "../../../packages/core/src/keys.ts";
import { buildManifest } from "../../../packages/core/src/manifest.ts";
import { buildStatement, signStatement } from "../../../packages/core/src/signature.ts";
import { SIGNATURE_FILE } from "../../../packages/core/src/types.ts";
import { createApp } from "../../index/src/server.ts";
import { type ListingRow, openStore } from "../../index/src/store.ts";
import { installSkill } from "../src/tools/install.ts";

const dirs: string[] = [];
const servers: Array<{ close: () => void }> = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function listen(app: ReturnType<typeof createApp>): Promise<string> {
  const listener = app.listen(0, "127.0.0.1");
  servers.push(listener);
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  return `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
}

async function tamperedListing(dataDir: string): Promise<ListingRow> {
  const skill = mkdtempSync(join(tmpdir(), "skillmark-failure-skill-"));
  dirs.push(skill);
  writeFileSync(
    join(skill, "SKILL.md"),
    "---\nname: tampered-skill\ndescription: Signed then changed.\nversion: 1.0.0\n---\n# Good\n",
  );
  const key = generateKey("tampered");
  const { manifestHash } = await buildManifest(skill);
  const statement = buildStatement({ manifestHash, name: "tampered-skill", version: "1.0.0", key });
  const sig = signStatement(statement, key);
  writeFileSync(join(skill, SIGNATURE_FILE), JSON.stringify(sig));
  writeFileSync(
    join(skill, "SKILL.md"),
    "---\nname: tampered-skill\ndescription: CHANGED\nversion: 1.0.0\n---\n# Changed\n",
  );
  const bundle = join(skill, "..", "tampered-skill.tgz");
  dirs.push(bundle);
  await pack({ gzip: true, cwd: skill, file: bundle }, ["./"]);
  const bytes = readFileSync(bundle);
  const bundleSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  mkdirSync(join(dataDir, "bundles"), { recursive: true });
  writeFileSync(join(dataDir, "bundles", `${bundleSha256.slice(7)}.tgz`), bytes);
  return {
    name: "tampered-skill",
    version: "1.0.0",
    description: "Signed then changed.",
    manifestHash,
    sig: JSON.stringify(sig),
    bundleSha256,
    sizeBytes: bytes.length,
    price: null,
    payTo: null,
    publisherAccount: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    status: "verified",
    publishedAt: new Date().toISOString(),
  };
}

describe("install never proceeds on an unprovable skill", () => {
  it("refuses a tampered bundle before touching Hermes or a wallet", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "skillmark-failure-index-"));
    dirs.push(dataDir);
    const store = openStore(dataDir);
    store.insertListing(await tamperedListing(dataDir));
    const base = await listen(createApp({ store, dataDir }));
    const text = await installSkill("tampered-skill", undefined, { indexUrl: base });
    expect(text).toContain("TAMPERED");
    expect(text).toContain("Not installed");
    expect(text).not.toContain("Hermes scanner:");
  });
});
