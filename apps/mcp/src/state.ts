import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface InstalledEntry {
  name: string;
  version: string;
  manifestHash: string;
  owner: string;
  installedAt: string;
  stagePath: string;
}

export function stateDir(): string {
  return process.env.SKILLMARK_STATE_DIR ?? join(homedir(), ".hermes", "skillmark");
}

function installedFile(): string {
  return join(stateDir(), "installed.json");
}

export function loadInstalled(): InstalledEntry[] {
  const file = installedFile();
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")) as InstalledEntry[];
}

export function saveInstalled(entries: InstalledEntry[]): void {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(installedFile(), `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
}

export function addInstalled(entry: InstalledEntry): void {
  const entries = loadInstalled().filter(
    (existing) => !(existing.name === entry.name && existing.version === entry.version),
  );
  entries.push(entry);
  saveInstalled(entries);
}

export function removeInstalled(name: string): InstalledEntry[] {
  const remaining = loadInstalled().filter((entry) => entry.name !== name);
  saveInstalled(remaining);
  return remaining;
}
