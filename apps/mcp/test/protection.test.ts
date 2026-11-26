import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryReader } from "../../../packages/core/src/verifier.ts";
import {
  auditIntervalFromEnv,
  renderProtection,
  runProtectedAudit,
  startAuditWatcher,
} from "../src/protection.ts";
import { readProtection } from "../src/state.ts";

const dirs: string[] = [];
const previousState = process.env.SKILLMARK_STATE_DIR;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-protection-test-"));
  dirs.push(dir);
  process.env.SKILLMARK_STATE_DIR = dir;
});
afterEach(() => {
  vi.useRealTimers();
  if (previousState === undefined) delete process.env.SKILLMARK_STATE_DIR;
  else process.env.SKILLMARK_STATE_DIR = previousState;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const reader: RegistryReader = {
  ownerOfKeyOnChain: async () => ({ found: true, ownerAccount: "alice", status: "Active" }),
  ownerOfKeyMcp: async () => ({ owner: "alice", status: "Active" }),
  checkBadge: async () => ({ agents: [] }),
};

describe("automatic protection", () => {
  it("validates the interval and allows zero to disable it", () => {
    expect(auditIntervalFromEnv(undefined)).toBe(60_000);
    expect(auditIntervalFromEnv("0")).toBe(0);
    expect(() => auditIntervalFromEnv("-1")).toThrow(/non-negative/);
  });

  it("records successful audit status", async () => {
    await runProtectedAudit({ indexUrl: "http://127.0.0.1:1" }, reader);
    expect(readProtection().lastReport).toEqual({
      checked: 0,
      healthy: 0,
      quarantined: 0,
      uncertain: 0,
    });
    expect(renderProtection()).toContain("automatic audit is off");
    expect(renderProtection()).toContain("last audit");
  });

  it("runs on a timer without keeping the process alive", async () => {
    vi.useFakeTimers();
    const stop = startAuditWatcher(
      { indexUrl: "http://127.0.0.1:1" },
      { intervalMs: 1_000, reader },
    );
    expect(readProtection().automatic).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(readProtection().lastAuditAt).toBeDefined();
    stop();
  });
});
