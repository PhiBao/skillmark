import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { jcs, sha256Hex } from "./canonical.js";

export const ZERO_HASH = "00".repeat(32);
export type LogType =
  | "verify"
  | "install"
  | "pay"
  | "blocked"
  | "quarantine"
  | "publish"
  | "anchor";

export interface LogEntry {
  seq: number;
  ts: string;
  type: LogType | string;
  data: unknown;
  prev: string;
  hash: string;
}

/** hash = sha256(bytes(prev) ‖ UTF-8 JCS(entry without hash)). */
export function entryHash(entry: Omit<LogEntry, "hash">): string {
  const body: Omit<LogEntry, "hash"> = entry;
  return sha256Hex(Buffer.concat([Buffer.from(entry.prev, "hex"), Buffer.from(jcs(body), "utf8")]));
}

/** Append to a hash-chained JSONL log with fsync. Returns the new root hash. */
export function appendEntry(
  file: string,
  type: LogType | string,
  data: unknown,
  now = new Date(),
): LogEntry {
  const previous = readLog(file);
  const last = previous.at(-1);
  const entry: Omit<LogEntry, "hash"> = {
    seq: last ? last.seq + 1 : 0,
    ts: now.toISOString(),
    type,
    data,
    prev: last?.hash ?? ZERO_HASH,
  };
  const complete: LogEntry = { ...entry, hash: entryHash(entry) };
  const fd = openSync(file, "a");
  try {
    writeSync(fd, `${JSON.stringify(complete)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return complete;
}

export function readLog(file: string): LogEntry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LogEntry);
}

export interface ChainCheck {
  valid: boolean;
  count: number;
  root: string;
  reason?: string;
}

/** Verify the chain end to end. Any edited line breaks the hash chain. */
export function verifyChain(file: string): ChainCheck {
  const entries = readLog(file);
  let previousHash = ZERO_HASH;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const expected = {
      seq: i,
      ts: entry.ts,
      type: entry.type,
      data: entry.data,
      prev: previousHash,
    };
    if (entry.seq !== i)
      return {
        valid: false,
        count: entries.length,
        root: previousHash,
        reason: `seq mismatch at ${i}`,
      };
    if (entry.prev !== previousHash)
      return {
        valid: false,
        count: entries.length,
        root: previousHash,
        reason: `prev mismatch at ${i}`,
      };
    if (entry.hash !== entryHash(expected))
      return {
        valid: false,
        count: entries.length,
        root: previousHash,
        reason: `hash mismatch at ${i}`,
      };
    previousHash = entry.hash;
  }
  return { valid: true, count: entries.length, root: previousHash };
}

/** The current root commits to all entries so far. */
export function logRoot(file: string): { root: string; seq: number } {
  const check = verifyChain(file);
  if (!check.valid) throw new Error(`Cannot anchor an invalid log: ${check.reason}`);
  return { root: check.root, seq: check.count === 0 ? 0 : check.count - 1 };
}
