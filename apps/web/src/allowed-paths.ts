import { homedir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { realpath } from "node:fs/promises";

const ALLOWED_ROOTS = ["/mnt", homedir()]
  .map((candidate) => path.resolve(candidate))
  .filter((candidate) => existsSync(candidate));

export class OutsideAllowedRootsError extends Error {
  constructor(public readonly resolvedPath: string) {
    super(`path is outside allowed roots: ${resolvedPath}`);
    this.name = "OutsideAllowedRootsError";
  }
}

function isWithinRoot(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function allowedPathErrorStatus(error: unknown, fallbackStatus: number): number {
  return error instanceof OutsideAllowedRootsError ? 403 : fallbackStatus;
}

export async function resolveAllowedPath(inputPath: string): Promise<string> {
  const resolved = await realpath(inputPath);

  if (!ALLOWED_ROOTS.some((root) => isWithinRoot(resolved, root))) {
    throw new OutsideAllowedRootsError(resolved);
  }

  return resolved;
}

export function allowedRoots(): string[] {
  return [...ALLOWED_ROOTS];
}
