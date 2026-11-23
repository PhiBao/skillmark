import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachSettlement,
  checkAndRecordSpend,
  limitsFromEnv,
  readSpend,
  rollbackSpend,
  SpendLimitError,
} from "../src/spend.ts";
import { assertRequirements } from "../src/tools/install.ts";
import { publishSkill } from "../src/tools/publish.ts";

const dirs: string[] = [];
const previousState = process.env.SKILLMARK_STATE_DIR;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "skillmark-spend-test-"));
  dirs.push(dir);
  process.env.SKILLMARK_STATE_DIR = dir;
});
afterEach(() => {
  if (previousState === undefined) delete process.env.SKILLMARK_STATE_DIR;
  else process.env.SKILLMARK_STATE_DIR = previousState;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const limits = { maxPerSkillMicroCcd: 1_000_000n, maxPerDayMicroCcd: 3_000_000n };

describe("payment pre-checks", () => {
  const listing = {
    name: "paid",
    version: "1.0.0",
    price: { amountMicroCcd: "250000", asset: "CCD" },
    payTo: "45jkbocxBigmrb4m1UGbv3JabCsaFRyDRfRRRLC5wLwyuiUa5q",
    manifestHash: `sha256:${"ab".repeat(32)}`,
  };
  const option = {
    network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    payTo: listing.payTo,
    amount: "250000",
    asset: "CCD",
    extra: { manifestHash: listing.manifestHash },
  };

  it("accepts matching requirements", () => {
    expect(() => assertRequirements(listing, option)).not.toThrow();
  });
  it("rejects a substituted network", () => {
    expect(() =>
      assertRequirements(listing, { ...option, network: "ccd:9dd9ca4d19e9393877d2c44b70f89acb" }),
    ).toThrow(/Wrong network/);
  });
  it("rejects a substituted payee", () => {
    expect(() =>
      assertRequirements(listing, {
        ...option,
        payTo: "3uR2Rp5oPsCJy7Btf3rXUNxujRiz6dJhdfp1k3hMPNr3GHTcWB",
      }),
    ).toThrow(/payTo/);
  });
  it("rejects a substituted amount", () => {
    expect(() => assertRequirements(listing, { ...option, amount: "1" })).toThrow(/Amount/);
  });
  it("rejects a substituted asset", () => {
    expect(() => assertRequirements(listing, { ...option, asset: "EUR" })).toThrow(/Asset/);
  });
  it("rejects a missing or changed manifestHash", () => {
    expect(() => assertRequirements(listing, { ...option, extra: {} })).toThrow(/manifestHash/);
  });
});

describe("publish path containment", () => {
  it("refuses a path outside HERMES_HOME/skills", async () => {
    process.env.HERMES_HOME = dirs[0];
    await expect(publishSkill("/etc", 0, { indexUrl: "http://127.0.0.1:1" })).rejects.toThrow(
      /inside HERMES_HOME/,
    );
  });
  it("refuses a price above 1 CCD", async () => {
    process.env.HERMES_HOME = dirs[0];
    const inside = join(dirs[0], "skills", "x");
    (await import("node:fs")).mkdirSync(inside, { recursive: true });
    await expect(publishSkill(inside, 2, { indexUrl: "http://127.0.0.1:1" })).rejects.toThrow(
      /between 0 and 1 CCD/,
    );
  });
});

describe("spend limits", () => {
  it("reads defaults and allows limits to be configured", () => {
    expect(limitsFromEnv({})).toEqual({
      maxPerSkillMicroCcd: 1_000_000n,
      maxPerDayMicroCcd: 3_000_000n,
    });
    expect(limitsFromEnv({ SPEND_MAX_PER_SKILL_MICROCCD: "500000" })).toMatchObject({
      maxPerSkillMicroCcd: 500_000n,
    });
  });

  it("rejects a payment over the per-skill cap", async () => {
    await expect(checkAndRecordSpend("s", "1.0.0", 1_000_001n, limits)).rejects.toBeInstanceOf(
      SpendLimitError,
    );
    expect(readSpend().payments).toHaveLength(0);
  });

  it("rejects a payment that would exceed the daily cap", async () => {
    await checkAndRecordSpend("s", "1.0.0", 1_000_000n, limits);
    await checkAndRecordSpend("s", "1.0.1", 1_000_000n, limits);
    await checkAndRecordSpend("s", "1.0.2", 1_000_000n, limits);
    await expect(checkAndRecordSpend("s", "1.0.3", 1n, limits)).rejects.toBeInstanceOf(
      SpendLimitError,
    );
  });

  it("persists payments and attaches a settlement", async () => {
    await checkAndRecordSpend("s", "1.0.0", 500_000n, limits);
    await attachSettlement("s", "1.0.0", "ab".repeat(32));
    const spend = readSpend();
    expect(spend.totalMicroCcd).toBe("500000");
    expect(spend.payments[0].txHash).toBe("ab".repeat(32));
  });

  it("rolls a reservation back when payment never settles", async () => {
    await checkAndRecordSpend("s", "1.0.0", 500_000n, limits);
    await rollbackSpend("s", "1.0.0", 500_000n);
    expect(readSpend()).toMatchObject({ totalMicroCcd: "0", payments: [] });
  });

  it("serialises concurrent calls through the file lock", async () => {
    const results = await Promise.allSettled([
      checkAndRecordSpend("a", "1", 1_000_000n, limits),
      checkAndRecordSpend("b", "1", 1_000_000n, limits),
      checkAndRecordSpend("c", "1", 1_000_000n, limits),
      checkAndRecordSpend("d", "1", 1_000_000n, limits),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(readSpend().totalMicroCcd).toBe("3000000");
  });
});
