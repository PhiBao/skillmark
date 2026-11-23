import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { anchorPayload, parseAnchor } from "../src/anchor.js";
import { appendEntry, logRoot, readLog, verifyChain, ZERO_HASH } from "../src/log.js";

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-log-"));
  dirs.push(dir);
  return join(dir, "log.jsonl");
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("hash-chained log", () => {
  it("starts from 32 zero bytes and links each entry", () => {
    const file = tempFile();
    const first = appendEntry(file, "verify", { name: "invoice-parser", result: "verified" });
    const second = appendEntry(file, "install", { name: "invoice-parser" });
    expect(first.seq).toBe(0);
    expect(first.prev).toBe(ZERO_HASH);
    expect(second.seq).toBe(1);
    expect(second.prev).toBe(first.hash);
    expect(verifyChain(file)).toEqual({ valid: true, count: 2, root: second.hash });
    expect(logRoot(file)).toEqual({ root: second.hash, seq: 1 });
  });

  it("detects a single edited line", () => {
    const file = tempFile();
    appendEntry(file, "verify", { result: "verified" });
    appendEntry(file, "install", { name: "invoice-parser" });
    const lines = readFileSync(file, "utf8").trim().split("\n");
    const edited = JSON.parse(lines[0]);
    edited.data.result = "tampered";
    lines[0] = JSON.stringify(edited);
    writeFileSync(file, `${lines.join("\n")}\n`);
    const check = verifyChain(file);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain("hash mismatch");
  });

  it("detects a deleted entry", () => {
    const file = tempFile();
    appendEntry(file, "verify", {});
    appendEntry(file, "install", {});
    const lines = readFileSync(file, "utf8").trim().split("\n");
    writeFileSync(file, `${lines[1]}\n`);
    expect(verifyChain(file).valid).toBe(false);
  });

  it("does not put skill content in the log entry data", () => {
    const file = tempFile();
    const entry = appendEntry(file, "verify", {
      name: "invoice-parser",
      result: "verified",
      manifestHash: "sha256:" + "ab".repeat(32),
    });
    expect(JSON.stringify(entry)).not.toContain("Invoices");
    expect(readLog(file)).toHaveLength(1);
  });
});

describe("anchor payload", () => {
  const root = "12".repeat(32);

  it("is exactly 45 bytes and round-trips", () => {
    const payload = anchorPayload(root, 7n);
    expect(payload.length).toBe(45);
    expect(payload.subarray(0, 4).toString()).toBe("SKM1");
    expect(payload[4]).toBe(1);
    expect(parseAnchor(payload)).toEqual({ magic: "SKM1", version: 1, root, seq: 7n });
  });

  it("writes the sequence big-endian", () => {
    expect(anchorPayload(root, 1n).subarray(37).toString("hex")).toBe("0000000000000001");
  });

  it("rejects bad roots, lengths and magic", () => {
    expect(() => anchorPayload("abcd", 1)).toThrow(/32 bytes/);
    expect(() => parseAnchor(Buffer.alloc(44))).toThrow(/45 bytes/);
    expect(() => parseAnchor(Buffer.concat([Buffer.from("NOPE"), Buffer.alloc(41)]))).toThrow(
      /magic/,
    );
  });
});
