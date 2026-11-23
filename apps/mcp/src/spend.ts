import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "./state.ts";

export interface SpendLimits {
  maxPerSkillMicroCcd: bigint;
  maxPerDayMicroCcd: bigint;
}

export interface SpendFile {
  day: string;
  totalMicroCcd: string;
  payments: Array<{
    name: string;
    version: string;
    amountMicroCcd: string;
    txHash: string;
    at: string;
  }>;
}

export function limitsFromEnv(env = process.env): SpendLimits {
  return {
    maxPerSkillMicroCcd: BigInt(env.SPEND_MAX_PER_SKILL_MICROCCD ?? "1000000"),
    maxPerDayMicroCcd: BigInt(env.SPEND_MAX_PER_DAY_MICROCCD ?? "3000000"),
  };
}

function spendFile(): string {
  return join(stateDir(), "spend.json");
}
function lockFile(): string {
  return join(stateDir(), "spend.lock");
}
function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function readSpend(): SpendFile {
  const file = spendFile();
  if (!existsSync(file)) return { day: today(), totalMicroCcd: "0", payments: [] };
  const parsed = JSON.parse(readFileSync(file, "utf8")) as SpendFile;
  if (parsed.day !== today()) return { day: today(), totalMicroCcd: "0", payments: [] };
  return parsed;
}

async function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const file = lockFile();
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      closeSync(openSync(file, "wx"));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() > deadline) throw new Error("Spend lock timeout");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(file, { force: true });
  }
}

export class SpendLimitError extends Error {}

/** Enforce per-skill and per-day limits. The caller cannot raise these from tool input. */
export async function checkAndRecordSpend(
  name: string,
  version: string,
  amountMicroCcd: bigint,
  limits: SpendLimits = limitsFromEnv(),
): Promise<void> {
  await withLock(() => {
    const spend = readSpend();
    if (amountMicroCcd > limits.maxPerSkillMicroCcd) {
      throw new SpendLimitError(
        `Amount ${amountMicroCcd} exceeds per-skill limit ${limits.maxPerSkillMicroCcd}`,
      );
    }
    const dayTotal = BigInt(spend.totalMicroCcd);
    if (dayTotal + amountMicroCcd > limits.maxPerDayMicroCcd) {
      throw new SpendLimitError(`Daily spend limit ${limits.maxPerDayMicroCcd} would be exceeded`);
    }
    spend.payments.push({
      name,
      version,
      amountMicroCcd: String(amountMicroCcd),
      txHash: "",
      at: new Date().toISOString(),
    });
    spend.totalMicroCcd = String(dayTotal + amountMicroCcd);
    writeFileSync(spendFile(), `${JSON.stringify(spend, null, 2)}\n`, { mode: 0o600 });
  });
}

/** Attach the settlement tx hash to the reserved payment. */
export async function attachSettlement(
  name: string,
  version: string,
  txHash: string,
): Promise<void> {
  await withLock(() => {
    const spend = readSpend();
    const payment = [...spend.payments]
      .reverse()
      .find((item) => item.name === name && item.version === version && !item.txHash);
    if (payment) payment.txHash = txHash;
    writeFileSync(spendFile(), `${JSON.stringify(spend, null, 2)}\n`, { mode: 0o600 });
  });
}

/** Roll back a reservation when payment never produced a settlement receipt. */
export async function rollbackSpend(
  name: string,
  version: string,
  amountMicroCcd: bigint,
): Promise<void> {
  await withLock(() => {
    const spend = readSpend();
    const index = spend.payments.findIndex(
      (payment) =>
        payment.name === name &&
        payment.version === version &&
        payment.amountMicroCcd === String(amountMicroCcd) &&
        !payment.txHash,
    );
    if (index === -1) return;
    spend.payments.splice(index, 1);
    spend.totalMicroCcd = String(BigInt(spend.totalMicroCcd) - amountMicroCcd);
    writeFileSync(spendFile(), `${JSON.stringify(spend, null, 2)}\n`, { mode: 0o600 });
  });
}
