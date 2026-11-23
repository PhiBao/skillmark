import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Express } from "express";

export const AGENT_CARD_PATH = "/agents/hermes/agent-card.json";

/** Serve the exact bytes that were hashed and pinned via build_set_agent_uri (never edit in place). */
export function mountAgentCard(app: Express, repoRoot: string): void {
  app.get(AGENT_CARD_PATH, (_req, res) => {
    try {
      const bytes = readFileSync(join(repoRoot, "config", "hermes-agent-card.json"));
      res.type("application/json").send(bytes);
    } catch {
      res.status(404).json({ error: "agent card not published" });
    }
  });
}
