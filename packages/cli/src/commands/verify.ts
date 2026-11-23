import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { x as untar } from "tar";
import { ownerOfKeyOnChain } from "../../../core/src/cis8.ts";
import { checkBadge, ownerOfKeyMcp } from "../../../core/src/registryMcp.ts";
import { type RegistryReader, verifySkill } from "../../../core/src/verifier.ts";
import type { Ctx } from "../index.ts";

export function realRegistryReader(ctx: Ctx): RegistryReader {
  return {
    ownerOfKeyOnChain: (key) => ownerOfKeyOnChain(key, ctx.config),
    ownerOfKeyMcp: async (key) =>
      (await ownerOfKeyMcp(key, { config: ctx.config })) as {
        owner?: string;
        status?: string;
      } | null,
    checkBadge: (owner) => checkBadge(owner, { config: ctx.config }),
  };
}

function render(result: Awaited<ReturnType<typeof verifySkill>>): void {
  const mark = result.result === "verified" ? "✓" : "✕";
  console.log(
    `${mark} ${result.key.namespace}/${result.key.key_type} — ${result.result.toUpperCase()}`,
  );
  if (result.owner_account) console.log(`  key owner ${result.owner_account}`);
  if (result.last_updated) console.log(`  last updated ${result.last_updated}`);
  if (result.reasons.length) console.log(`  reasons: ${result.reasons.join(", ")}`);
  if (result.result === "verified")
    console.log(
      "  Hermes scanner still decides 'dangerous'; identity limits damage, it does not prove safety.",
    );
}

async function fromUrl(url: string, ctx: Ctx): Promise<void> {
  // Provenance page -> index bundle endpoints.
  const parsed = new URL(url);
  const match = /^\/s\/([^/]+)\/([^/]+)\/?$/.exec(parsed.pathname);
  if (!match) throw new Error(`Cannot derive bundle from URL ${url}; expected /s/<name>/<version>`);
  const [, name, version] = match;
  const base = `${parsed.origin}/skills/${name}/${version}`;
  const bundleResponse = await fetch(`${base}/bundle.tgz`);
  if (!bundleResponse.ok) throw new Error(`Could not fetch bundle: HTTP ${bundleResponse.status}`);
  const dir = mkdtempSync(join(tmpdir(), "skillmark-verify-"));
  try {
    const file = join(dir, "bundle.tgz");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, Buffer.from(await bundleResponse.arrayBuffer()));
    const skillDir = join(dir, "skill");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(skillDir);
    await untar({
      cwd: skillDir,
      file,
      filter: (path) => !path.startsWith("/") && !path.split("/").includes(".."),
    });
    render(
      await verifySkill(skillDir, { registryReader: realRegistryReader(ctx), config: ctx.config }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function verify(target: string, ctx: Ctx): Promise<void> {
  if (!target) throw new Error("usage: skillmark verify <dir|url>");
  if (/^https?:\/\//.test(target)) {
    await fromUrl(target, ctx);
    return;
  }
  if (!existsSync(target)) throw new Error(`No such skill directory: ${target}`);
  render(
    await verifySkill(target, { registryReader: realRegistryReader(ctx), config: ctx.config }),
  );
}
