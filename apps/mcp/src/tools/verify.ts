import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { x as untar } from "tar";
import { loadConfig } from "../../../../packages/core/src/config.ts";
import type { SignatureFile } from "../../../../packages/core/src/types.ts";
import {
  createRegistryReader,
  type Verification,
  verifySkill,
} from "../../../../packages/core/src/verifier.ts";

export interface McpConfig {
  indexUrl: string;
}

export interface FetchedSkill {
  verification: Verification;
  listing: Record<string, unknown>;
  sig: SignatureFile;
  skillDir: string;
  cleanup: () => void;
}

function unsafePath(path: string): boolean {
  const normalised = path.replace(/\\/g, "/");
  return normalised.startsWith("/") || normalised.split("/").includes("..");
}

function checkEntries(dir: string): boolean {
  const walk = (current: string): boolean => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) return false;
      if (stat.isDirectory() && !walk(full)) return false;
    }
    return true;
  };
  return walk(dir);
}

/** Extract a bundle to a temp dir and run the verifier. */
export async function extractAndVerify(
  bytes: Buffer,
): Promise<{ verification: Verification; skillDir: string; cleanup: () => void }> {
  const temp = mkdtempSync(join(tmpdir(), "skillmark-mcp-"));
  const skillDir = join(temp, "skill");
  mkdirSync(skillDir);
  try {
    const bundleFile = join(temp, "bundle.tgz");
    writeFileSync(bundleFile, bytes);
    const rejected: string[] = [];
    let extractedFiles = 0;
    let extractedBytes = 0;
    try {
      await untar({
        cwd: skillDir,
        file: bundleFile,
        filter: (path: string, entry: any) => {
          const type = String(entry?.type ?? "File");
          if (!["File", "Directory"].includes(type) || unsafePath(path)) {
            rejected.push(path);
            return false;
          }
          if (type === "File") {
            extractedFiles += 1;
            extractedBytes += Number(entry?.size ?? 0);
            if (extractedFiles > 500 || extractedBytes > 50 * 1024 * 1024) {
              rejected.push(path);
              return false;
            }
          }
          return true;
        },
      });
    } catch {
      throw new Error("Unsafe or oversized skill bundle");
    }
    if (rejected.length || !checkEntries(skillDir)) throw new Error("Unsafe entry in skill bundle");
    const verification = await verifySkill(skillDir, {
      registryReader: createRegistryReader(loadConfig()),
    });
    return {
      verification,
      skillDir,
      cleanup: () => rmSync(temp, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

export async function fetchAndVerify(
  name: string,
  version?: string,
  config: McpConfig = { indexUrl: process.env.SKILLMARK_INDEX_URL ?? "http://127.0.0.1:8080" },
): Promise<FetchedSkill> {
  const base = config.indexUrl.replace(/\/$/, "");
  const skills = (await (await fetch(`${base}/api/skills`)).json()) as Array<
    Record<string, unknown>
  >;
  const matches = skills.filter((skill) => skill.name === name);
  const listing = version ? matches.find((skill) => skill.version === version) : matches[0];
  if (!listing) throw new Error(`Unknown skill: ${name}${version ? `@${version}` : ""}`);
  const resolvedVersion = String(listing.version);
  const bundleResponse = await fetch(`${base}/skills/${name}/${resolvedVersion}/bundle.tgz`);
  if (!bundleResponse.ok)
    throw new Error(`Could not fetch ${name} bundle: HTTP ${bundleResponse.status}`);

  const temp = mkdtempSync(join(tmpdir(), "skillmark-mcp-"));
  const skillDir = join(temp, "skill");
  mkdirSync(skillDir);
  try {
    const bundleFile = join(temp, "bundle.tgz");
    writeFileSync(bundleFile, Buffer.from(await bundleResponse.arrayBuffer()));
    const rejected: string[] = [];
    let extractedFiles = 0;
    let extractedBytes = 0;
    try {
      await untar({
        cwd: skillDir,
        file: bundleFile,
        filter: (path: string, entry: any) => {
          const type = String(entry?.type ?? "File");
          if (!["File", "Directory"].includes(type) || unsafePath(path)) {
            rejected.push(path);
            return false;
          }
          if (type === "File") {
            extractedFiles += 1;
            extractedBytes += Number(entry?.size ?? 0);
            if (extractedFiles > 500 || extractedBytes > 50 * 1024 * 1024) {
              rejected.push(path);
              return false;
            }
          }
          return true;
        },
      });
    } catch {
      throw new Error("Unsafe or oversized skill bundle");
    }
    if (rejected.length || !checkEntries(skillDir)) throw new Error("Unsafe entry in skill bundle");
    const sig = JSON.parse(
      readFileSync(join(skillDir, "skillmark.sig.json"), "utf8"),
    ) as SignatureFile;
    const verification = await verifySkill(skillDir, {
      registryReader: createRegistryReader(loadConfig()),
    });
    return {
      verification,
      listing,
      sig,
      skillDir,
      cleanup: () => rmSync(temp, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

export function renderVerification(name: string, version: string, result: Verification): string {
  const mark = result.result === "verified" ? "✓" : "✕";
  const lines = [`${mark} ${name} ${version} — ${result.result.toUpperCase()}`];
  if (result.owner_account) lines.push(`  key owner ${result.owner_account} (identity-backed)`);
  if (result.last_updated) lines.push(`  key active since ${result.last_updated}`);
  if (result.reasons.length) lines.push(`  checks: ${result.reasons.join(", ")}`);
  if (result.result !== "verified") lines.push("  Not installed.");
  else
    lines.push(
      '  Hermes scanner still decides "dangerous"; identity limits damage, it does not prove safety.',
    );
  return lines.join("\n");
}
