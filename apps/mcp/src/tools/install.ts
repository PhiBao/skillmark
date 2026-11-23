import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { hermesInstall, hermesList, installSucceeded, verdictOf } from "../hermes.ts";
import { startLocalWellKnown } from "../localWellKnown.ts";
import { addInstalled, stateDir } from "../state.ts";
import { fetchAndVerify, type McpConfig, renderVerification } from "./verify.ts";

export async function installSkill(
  name: string,
  version: string | undefined,
  config: McpConfig,
): Promise<string> {
  const fetched = await fetchAndVerify(name, version, config);
  const resolvedVersion = String(fetched.listing.version);
  const summary = renderVerification(name, resolvedVersion, fetched.verification);
  if (fetched.verification.result !== "verified") {
    fetched.cleanup();
    return `${summary}\n  Not installed.`;
  }

  const stageRoot = join(stateDir(), "staging");
  const stage = join(stageRoot, name);
  mkdirSync(stageRoot, { recursive: true });
  rmSync(stage, { recursive: true, force: true });
  cpSync(fetched.skillDir, stage, { recursive: true });
  fetched.cleanup();

  const server = await startLocalWellKnown(stageRoot);
  let output: string;
  try {
    const identifier = `well-known:${server.url}/.well-known/skills/${name}`;
    const result = await hermesInstall(identifier);
    output = `${result.stdout}${result.stderr}`;
    const verdict = verdictOf(output);
    if (verdict === "unknown")
      console.error("[skillmark] unparsed Hermes output:", output.slice(0, 2000));
    if (verdict === "dangerous" || !installSucceeded(result)) {
      await hermesList();
      return `${summary}\n  Hermes scanner: ${verdict}\n  ✕ Install blocked — not installed.`;
    }
    addInstalled({
      name,
      version: resolvedVersion,
      manifestHash: fetched.verification.manifestHash ?? "",
      owner: fetched.verification.owner_account ?? "",
      installedAt: new Date().toISOString(),
      stagePath: stage,
    });
    const list = await hermesList();
    const listed = list.stdout.toLowerCase().includes(name.toLowerCase());
    return `${summary}\n  Hermes scanner: ${verdict} · ${listed ? "installed" : "install attempted"}`;
  } finally {
    await server.close();
  }
}
