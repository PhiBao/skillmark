import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashManifest, sha256Hex } from "../src/canonical.js";
import {
  buildManifest,
  MAX_FILES,
  parseFrontmatter,
  validateRelativePath,
} from "../src/manifest.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-manifest-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SKILL_MD = `---
name: invoice-parser
description: Parse invoices.
version: 1.0.0
---
# Invoice Parser
`;

function skillWith(extra: Record<string, string> = {}, order: string[] = []): string {
  const dir = tempDir();
  const files: Record<string, string> = { "SKILL.md": SKILL_MD, ...extra };
  const keys = [...Object.keys(files)];
  keys.sort();
  const ordered = order.length ? order : keys;
  for (const key of ordered) {
    const path = join(dir, key);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, files[key]);
  }
  return dir;
}

describe("frontmatter", () => {
  it("reads name, description and version", () => {
    expect(parseFrontmatter(SKILL_MD)).toEqual({
      name: "invoice-parser",
      description: "Parse invoices.",
      version: "1.0.0",
    });
  });
});

describe("buildManifest", () => {
  it("hashes deterministically regardless of file creation order", async () => {
    const extra = { "scripts/a.sh": "echo a\n", "references/b.md": "b\n" };
    const a = skillWith(extra, ["SKILL.md", "scripts/a.sh", "references/b.md"]);
    const b = skillWith(extra, ["references/b.md", "SKILL.md", "scripts/a.sh"]);
    const ma = await buildManifest(a);
    const mb = await buildManifest(b);
    expect(ma.manifestHash).toBe(mb.manifestHash);
    expect(ma.manifest.files.map((f) => f.path)).toEqual([
      "SKILL.md",
      "references/b.md",
      "scripts/a.sh",
    ]);
  });

  it("changes the hash when one byte changes", async () => {
    const a = skillWith({ "scripts/a.sh": "echo a\n" });
    const b = skillWith({ "scripts/a.sh": "echo b\n" });
    expect((await buildManifest(a)).manifestHash).not.toBe((await buildManifest(b)).manifestHash);
  });

  it("excludes skillmark.sig.json from the manifest", async () => {
    const dir = skillWith({ "skillmark.sig.json": '{"signature_hex":"ab"}' });
    const { manifest } = await buildManifest(dir);
    expect(manifest.files.some((f) => f.path === "skillmark.sig.json")).toBe(false);
  });

  it("rejects symlinks rather than following them", async () => {
    const dir = skillWith();
    const outside = tempDir();
    writeFileSync(join(outside, "secret.txt"), "nope");
    symlinkSync(join(outside, "secret.txt"), join(dir, "leak.txt"));
    await expect(buildManifest(dir)).rejects.toThrow(/Non-regular file/);
  });

  it("rejects more than 500 files", async () => {
    const extra: Record<string, string> = {};
    for (let i = 0; i < MAX_FILES; i += 1) extra[`f/${String(i).padStart(3, "0")}.txt`] = "x";
    const dir = skillWith(extra);
    await expect(buildManifest(dir)).rejects.toThrow(/more than 500 files/);
  });

  it("rejects a skill larger than 5 MiB", async () => {
    const dir = skillWith({ "big.bin": "x".repeat(5 * 1024 * 1024) });
    await expect(buildManifest(dir)).rejects.toThrow(/5 MiB/);
  });

  it("rejects a mismatched expected name or version", async () => {
    const dir = skillWith();
    await expect(buildManifest(dir, { name: "other-name" })).rejects.toThrow(/name mismatch/);
    await expect(buildManifest(dir, { version: "2.0.0" })).rejects.toThrow(/version mismatch/);
  });

  it("produces the sha256:<hex> form", async () => {
    const { manifest, manifestHash } = await buildManifest(skillWith());
    expect(manifestHash).toBe(hashManifest(manifest));
    expect(manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("path rules", () => {
  it("rejects absolute, dot-segment, backslash and over-long paths", () => {
    expect(() => validateRelativePath("/etc/passwd")).toThrow();
    expect(() => validateRelativePath("../escape")).toThrow();
    expect(() => validateRelativePath("a/../../b")).toThrow();
    expect(() => validateRelativePath("a\\b")).toThrow();
    expect(() => validateRelativePath("x".repeat(256))).toThrow(/255 bytes/);
    expect(() => validateRelativePath("scripts/a.sh")).not.toThrow();
  });
});
