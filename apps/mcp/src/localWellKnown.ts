import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express, { type Express } from "express";
import { parseFrontmatter } from "../../../packages/core/src/manifest.ts";

export interface WellKnownServer {
  url: string;
  close: () => Promise<void>;
}

function listFiles(dir: string, prefix = ""): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) result.push(...listFiles(full, `${prefix}${entry}/`));
    else if (stat.isFile()) result.push(`${prefix}${entry}`);
  }
  return result;
}

export function buildLocalIndex(stageDir: string) {
  const skills: Array<{ name: string; description: string; files: string[] }> = [];
  if (!existsSync(stageDir)) return { skills };
  for (const name of readdirSync(stageDir)) {
    const dir = join(stageDir, name);
    if (!existsSync(join(dir, "SKILL.md"))) continue;
    const frontmatter = parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
    skills.push({ name, description: frontmatter.description ?? "", files: listFiles(dir) });
  }
  return { skills };
}

export function createWellKnownApp(stageDir: string): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/.well-known/skills/index.json", (_req, res) => res.json(buildLocalIndex(stageDir)));
  app.get("/.well-known/agent-skills/index.json", (_req, res) =>
    res.json(buildLocalIndex(stageDir)),
  );
  app.get(/^\/\.well-known\/(?:skills|agent-skills)\/.+$/, (req, res) => {
    const marker = "/.well-known/";
    const rest = req.path
      .slice(req.path.indexOf(marker) + marker.length)
      .split("/")
      .slice(1);
    const [name, ...fileParts] = rest;
    const file = fileParts.join("/");
    if (!/^[a-z0-9-]+$/.test(name) || !file || file.split("/").includes("..")) {
      res.status(400).end("invalid path");
      return;
    }
    const full = join(stageDir, name, file);
    if (!full.startsWith(join(stageDir, name)) || !existsSync(full)) {
      res.status(404).end("not found");
      return;
    }
    res.sendFile(full);
  });
  return app;
}

/** Serve staged skills on loopback so Hermes's own scanner runs on install. */
export async function startLocalWellKnown(stageDir: string): Promise<WellKnownServer> {
  const server = createWellKnownApp(stageDir).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not bind local well-known server");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
