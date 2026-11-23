import { lstat, readdir, readFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";
import { hashManifest, jcs, sha256Hex } from "./canonical.js";
import {
  type Frontmatter,
  MANIFEST_SCHEMA,
  type Manifest,
  type ManifestFile,
  SIGNATURE_FILE,
  SKILL_NAME_RE,
} from "./types.js";

export const MAX_FILES = 500;
export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_PATH_BYTES = 255;

/** Validates a relative POSIX path from A§4.2. Throws on any unsafe value. */
export function validateRelativePath(path: string): void {
  if (!path || path.startsWith("/") || path.includes("\\")) {
    throw new Error(`Invalid skill file path: ${JSON.stringify(path)}`);
  }
  if (path.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`Invalid skill file path (dot segment): ${JSON.stringify(path)}`);
  }
  if (Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES) {
    throw new Error(`Skill file path exceeds ${MAX_PATH_BYTES} bytes: ${path}`);
  }
}

/** Minimal frontmatter parser for the `name`, `description` and `version` keys. No YAML dependency. */
export function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = content.slice(3, end);
  const result: Frontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const key = match[1];
    if (key !== "name" && key !== "description" && key !== "version") continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function assertName(name: string): void {
  if (
    typeof name !== "string" ||
    name.length < 1 ||
    name.length > 64 ||
    !SKILL_NAME_RE.test(name)
  ) {
    throw new Error(`Invalid skill name: ${JSON.stringify(name)}`);
  }
}

export interface BuildManifestOptions {
  /** Expected name; if given it must match SKILL.md frontmatter. */
  name?: string;
  /** Expected version; if given it must match SKILL.md frontmatter. */
  version?: string;
}

export interface BuiltManifest {
  manifest: Manifest;
  manifestHash: string;
}

/**
 * Walk a skill directory with lstat (never following symlinks) and build the
 * normative manifest from A§4.1/A§4.2.
 */
export async function buildManifest(
  dir: string,
  options: BuildManifestOptions = {},
): Promise<BuiltManifest> {
  const dirStat = await lstat(dir);
  if (!dirStat.isDirectory()) throw new Error(`Not a skill directory: ${dir}`);

  const skillMd = await readFile(join(dir, "SKILL.md"), "utf8").catch(() => {
    throw new Error("Skill directory is missing SKILL.md");
  });
  const frontmatter = parseFrontmatter(skillMd);
  if (!frontmatter.name) throw new Error("SKILL.md frontmatter is missing name");
  if (!frontmatter.version) throw new Error("SKILL.md frontmatter is missing version");
  assertName(frontmatter.name);
  if (options.name !== undefined && options.name !== frontmatter.name) {
    throw new Error(
      `Skill name mismatch: expected ${options.name}, SKILL.md says ${frontmatter.name}`,
    );
  }
  if (options.version !== undefined && options.version !== frontmatter.version) {
    throw new Error(
      `Skill version mismatch: expected ${options.version}, SKILL.md says ${frontmatter.version}`,
    );
  }

  const files: ManifestFile[] = [];
  let total = 0;

  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const stat = await lstat(full); // lstat: symlinks are rejected, never followed
      const rel = posix.normalize(relative(dir, full).split("\\").join("/"));
      validateRelativePath(rel);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        throw new Error(`Non-regular file in skill directory: ${rel}`);
      }
      if (stat.isDirectory()) {
        await walk(full);
        continue;
      }
      if (rel === SIGNATURE_FILE) continue; // signature is never part of the manifest
      if (files.length >= MAX_FILES) throw new Error(`Skill has more than ${MAX_FILES} files`);
      const bytes = await readFile(full);
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) throw new Error("Skill contents exceed 5 MiB");
      files.push({ path: rel, sha256: sha256Hex(bytes), size: bytes.length });
    }
  };
  await walk(dir);

  files.sort((a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8")));
  const manifest: Manifest = {
    schema: MANIFEST_SCHEMA,
    name: frontmatter.name,
    version: frontmatter.version,
    files,
  };
  return { manifest, manifestHash: hashManifest(manifest) };
}

/** Recompute a hash from a candidate manifest (used by the verifier). */
export function manifestHashOf(manifest: Manifest): string {
  return `sha256:${sha256Hex(Buffer.from(jcs(manifest), "utf8"))}`;
}
