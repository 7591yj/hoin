import { homedir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { realpath } from "node:fs/promises";

const ALLOWED_ROOTS = ["/mnt", homedir()]
  .map((candidate) => path.resolve(candidate))
  .filter((candidate) => existsSync(candidate));

function isWithinRoot(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export async function resolveAllowedPath(inputPath: string): Promise<string> {
  const resolved = await realpath(inputPath);

  if (!ALLOWED_ROOTS.some((root) => isWithinRoot(resolved, root))) {
    throw new Error(`path is outside allowed roots: ${resolved}`);
  }

  return resolved;
}

export function allowedRoots(): string[] {
  return [...ALLOWED_ROOTS];
}
