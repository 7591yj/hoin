import { realpath } from "node:fs/promises";
import path from "node:path";

import { resolveAllowedPath } from "../../allowed-paths.ts";
import type { MoveEntry } from "../../types/categorize.ts";

export function isWithinDirectory(candidate: string, dir: string): boolean {
  const relative = path.relative(dir, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function nearestExistingAncestor(candidate: string): Promise<string> {
  let current = candidate;
  while (true) {
    try {
      return await realpath(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`no existing ancestor for path: ${candidate}`);
      current = parent;
    }
  }
}

export async function resolveSelectedFiles(files: string[], targetDir: string): Promise<string[]> {
  return Promise.all(
    files.map(async (file) => {
      const resolved = await resolveAllowedPath(file);
      if (!isWithinDirectory(resolved, targetDir)) {
        throw new Error(`selected file is outside target directory: ${resolved}`);
      }
      return resolved;
    }),
  );
}

export async function resolveMove(move: MoveEntry, targetDir: string): Promise<MoveEntry> {
  const from = await resolveAllowedPath(move.from);
  const to = path.resolve(move.to);
  const destinationAncestor = await nearestExistingAncestor(path.dirname(to));

  if (!isWithinDirectory(from, targetDir)) {
    throw new Error(`move source is outside target directory: ${from}`);
  }
  if (!isWithinDirectory(to, targetDir) || !isWithinDirectory(destinationAncestor, targetDir)) {
    throw new Error(`move destination is outside target directory: ${to}`);
  }

  return { ...move, from, to };
}
