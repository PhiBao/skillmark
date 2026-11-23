import { execFile } from "node:child_process";

export interface HermesResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the Hermes CLI with execFile — never through a shell. */
export function hermes(args: string[]): Promise<HermesResult> {
  const bin = process.env.HERMES_BIN ?? "hermes";
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error(`Hermes binary not found: ${bin}`));
          return;
        }
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

export function hermesInstall(identifier: string): Promise<HermesResult> {
  return hermes(["skills", "install", identifier, "--yes"]);
}

export function hermesUninstall(name: string): Promise<HermesResult> {
  return hermes(["skills", "uninstall", name, "--yes"]);
}

export function hermesList(): Promise<HermesResult> {
  return hermes(["skills", "list"]);
}

export type ScanVerdict = "safe" | "caution" | "dangerous" | "unknown";

/** Parse the scanner verdict from Hermes's CLI output. */
export function verdictOf(output: string): ScanVerdict {
  const match = /Verdict:\s*(SAFE|DANGEROUS|CAUTION)/i.exec(output);
  if (!match) return "unknown";
  return match[1].toLowerCase() as ScanVerdict;
}

export function installSucceeded(result: HermesResult): boolean {
  return result.code === 0 && /Installed:/i.test(result.stdout);
}
