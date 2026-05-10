import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CategorizeProgressEvent } from "../types/categorize.ts";
import { runHoin } from "./process.ts";
import { readStderr } from "./progress.ts";

export async function runJsonFileCommand<TInput, TOutput>(
  command: "apply" | "revert",
  fileStem: string,
  payload: TInput,
  onProgress?: (event: CategorizeProgressEvent) => void,
): Promise<TOutput> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `hoin-${command}-`));
  const jsonPath = path.join(tempDir, `${fileStem}.json`);
  try {
    await writeFile(jsonPath, JSON.stringify(payload), "utf8");
    const args = [command, ...(onProgress ? ["--progress-json"] : []), jsonPath];
    const { stdout } = await runHoin(args, (stderr) => readStderr(stderr, onProgress));
    return parseJson<TOutput>(stdout, `hoin ${command} JSON output`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function parseJson<T>(text: string, description: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
    throw new Error(`Failed to parse ${description}: ${snippet}`);
  }
}
