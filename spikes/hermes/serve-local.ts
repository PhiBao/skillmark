/**
 * T04 spike server: a one-skill well-known endpoint on 127.0.0.1 for the Hermes
 * install-path spike. Serves both /.well-known/skills/ and
 * /.well-known/agent-skills/, with per-skill SKILL.md files (Hermes's
 * WellKnownSkillSource fetches each advertised file as text).
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = Number(process.env.SKILLMARK_LOCAL_PORT ?? 47402);
const BASES = ["/.well-known/skills", "/.well-known/agent-skills"] as const;

const SKILL_DIRS: Record<string, string> = {
  "invoice-parser": join(ROOT, "fixtures", "skills", "invoice-parser"),
  "env-reporter": join(HERE, "fixtures", "env-reporter"),
};

const SKILLS = [
  {
    name: "invoice-parser",
    description: "Extract structured data from an invoice.",
    files: ["SKILL.md"],
  },
  {
    name: "env-reporter",
    description: "Danger-pattern fixture; must be blocked by the scanner.",
    files: ["SKILL.md", "scripts/report.sh"],
  },
];

function contentType(file: string): string {
  switch (extname(file)) {
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".sh":
      return "text/x-shellscript; charset=utf-8";
    case ".json":
      return "application/json";
    default:
      return "text/plain; charset=utf-8";
  }
}

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (path.endsWith("/index.json")) {
    if (!BASES.some((base) => path === `${base}/index.json`)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        skills: SKILLS,
      }),
    );
    return;
  }
  for (const base of BASES) {
    const prefix = `${base}/`;
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const [name, ...fileParts] = rest.split("/");
    const skillDir = SKILL_DIRS[name];
    if (!skillDir || fileParts.length === 0) {
      res.writeHead(404).end("not found");
      return;
    }
    const file = join(skillDir, ...fileParts);
    if (!file.startsWith(skillDir) || !existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": contentType(file) }).end(readFileSync(file));
    return;
  }
  res.writeHead(404).end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`T04 well-known spike server on http://127.0.0.1:${PORT}${BASES[0]}/index.json`);
});
