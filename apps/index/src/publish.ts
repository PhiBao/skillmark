import { createHash } from "node:crypto";
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
import type { Express, NextFunction, Request, Response } from "express";
import { x as untar } from "tar";
import { buildManifest } from "../../../packages/core/src/manifest.ts";
import { SIGNATURE_FILE } from "../../../packages/core/src/types.ts";
import { type RegistryReader, verifySkill } from "../../../packages/core/src/verifier.ts";
import { bundleFilename } from "./bundles.ts";
import type { Store } from "./store.ts";

export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

export interface PublishOptions {
  store: Store;
  dataDir: string;
  registryReader: RegistryReader;
  rateLimitPerHour?: number;
}

interface RateEntry {
  count: number;
  resetAt: number;
}
const rates = new Map<string, RateEntry>();

function rateLimited(ip: string, limit: number): boolean {
  const now = Date.now();
  const entry = rates.get(ip);
  if (!entry || now >= entry.resetAt) {
    rates.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

async function formData(req: Request): Promise<FormData> {
  // Node's undici Request accepts an IncomingMessage body with duplex: "half".
  const request = new Request("http://localhost/api/publish", {
    method: "POST",
    headers: req.headers as Record<string, string>,
    body: req as unknown as ReadableStream,
    duplex: "half",
  } as RequestInit);
  return request.formData();
}

function unsafePath(path: string): boolean {
  const normalised = path.replace(/\\/g, "/");
  return normalised.startsWith("/") || normalised.split("/").includes("..");
}

export function registerPublish(app: Express, options: PublishOptions): void {
  const limit = options.rateLimitPerHour ?? 20;
  app.post("/api/publish", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (rateLimited(req.ip ?? "unknown", limit)) {
        res.status(429).json({ error: "rate limit exceeded" });
        return;
      }
      const form = await formData(req);
      const bundle = form.get("bundle");
      const listingJson = form.get("listing");
      if (!(bundle instanceof File) || typeof listingJson !== "string") {
        res.status(400).json({ error: "bundle.tgz and listing are required" });
        return;
      }
      if (bundle.size > MAX_BUNDLE_BYTES) {
        res.status(413).json({ error: "bundle exceeds 5 MiB" });
        return;
      }
      const listing = JSON.parse(listingJson) as Record<string, unknown>;
      const bytes = Buffer.from(await bundle.arrayBuffer());

      const temp = mkdtempSync(join(tmpdir(), "skillmark-publish-"));
      try {
        const bundleFile = join(temp, "bundle.tgz");
        writeFileSync(bundleFile, bytes);
        const skillDir = join(temp, "skill");
        mkdirSync(skillDir);
        const rejected: string[] = [];
        await untar({
          cwd: skillDir,
          file: bundleFile,
          filter: (path: string, entry: any) => {
            const type = String((entry as { type?: string })?.type ?? "File");
            if (!["File", "Directory"].includes(type) || unsafePath(path)) {
              rejected.push(path);
              return false;
            }
            return true;
          },
        });
        // A rejected link/absolute path is a 400; verifySkill decides other invalid cases.
        if (rejected.length > 0 || !requireEntries(skillDir)) {
          res.status(400).json({ error: "unsafe entry in bundle" });
          return;
        }

        const verification = await verifySkill(skillDir, {
          registryReader: options.registryReader,
          priorRecords: options.store.listListings().map((row) => ({
            key: (() => {
              const sig = JSON.parse(row.sig);
              return sig.statement.key;
            })(),
            result: row.status,
          })),
        });
        if (verification.result !== "verified") {
          options.store.addKeyHistory({
            key: verification.key.public_key_hex,
            name: String(listing.name ?? ""),
            version: String(listing.version ?? ""),
            result: verification.result,
          });
          res.status(422).json({ error: verification.result, reasons: verification.reasons });
          return;
        }

        // Listing fields must agree with the signed statement.
        const sig = JSON.parse(readFileSync(join(skillDir, SIGNATURE_FILE), "utf8"));
        const manifest = await buildManifest(skillDir);
        if (
          listing.name !== sig.statement.name ||
          listing.version !== sig.statement.version ||
          listing.manifestHash !== manifest.manifestHash
        ) {
          res.status(400).json({ error: "listing conflicts with signed statement" });
          return;
        }

        const bundleSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        const bundlesDir = join(options.dataDir, "bundles");
        mkdirSync(bundlesDir, { recursive: true });
        writeFileSync(join(bundlesDir, bundleFilename(bundleSha256)), bytes);

        const price =
          listing.price === null || listing.price === undefined
            ? null
            : JSON.stringify(listing.price);
        options.store.insertListing({
          name: sig.statement.name,
          version: sig.statement.version,
          description: String(listing.description ?? ""),
          manifestHash: manifest.manifestHash,
          sig: JSON.stringify(sig),
          bundleSha256,
          sizeBytes: bytes.length,
          price,
          payTo: typeof listing.payTo === "string" ? listing.payTo : null,
          publisherAccount: verification.owner_account ?? "",
          status: "verified",
          publishedAt: new Date().toISOString(),
        });
        options.store.addKeyHistory({
          key: verification.key.public_key_hex,
          name: sig.statement.name,
          version: sig.statement.version,
          result: "verified",
        });
        res.status(201).json({
          name: sig.statement.name,
          version: sig.statement.version,
          manifestHash: manifest.manifestHash,
        });
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    } catch (error) {
      next(error);
    }
  });
}

/** tar's filter cannot abort with a status code, so re-check extracted paths on disk. */
function requireEntries(dir: string): boolean {
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
