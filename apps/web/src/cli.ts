import type {
  CategorizeJsonOutput,
  CategorizeProgressEvent,
  OperationJsonOutput,
} from "./types/categorize.ts";
import { runJsonFileCommand, parseJson } from "./cli/json-command.ts";
import { runHoin } from "./cli/process.ts";
import { readStderr } from "./cli/progress.ts";

export interface CategorizeOptions {
  modelDir: string;
  targetDir: string;
  dryRun: boolean;
  ja?: boolean;
  minConfidence?: number;
  selectedFiles?: string[];
  onProgress?: (event: CategorizeProgressEvent) => void;
}

export async function runApply(
  plan: CategorizeJsonOutput,
  onProgress?: (event: CategorizeProgressEvent) => void,
): Promise<OperationJsonOutput> {
  return runJsonFileCommand<CategorizeJsonOutput, OperationJsonOutput>(
    "apply",
    "plan",
    plan,
    onProgress,
  );
}

export async function runRevert(
  operation: OperationJsonOutput,
  onProgress?: (event: CategorizeProgressEvent) => void,
): Promise<{ reverted: number }> {
  return runJsonFileCommand<OperationJsonOutput, { reverted: number }>(
    "revert",
    "operation",
    operation,
    onProgress,
  );
}

export async function runCategorize(opts: CategorizeOptions): Promise<CategorizeJsonOutput> {
  const selectedFiles = opts.selectedFiles ?? [];
  const args = [
    "categorize",
    "--model-dir",
    opts.modelDir,
    "--json",
    ...(opts.dryRun ? ["--dry-run"] : []),
    ...(opts.ja ? ["--ja"] : []),
    ...(opts.minConfidence !== undefined ? ["--min-confidence", String(opts.minConfidence)] : []),
    ...(opts.onProgress ? ["--progress-json"] : []),
    ...selectedFiles.flatMap((file) => ["--file", file]),
    opts.targetDir,
  ];

  const { stdout } = await runHoin(args, (stderr) => readStderr(stderr, opts.onProgress));
  return parseJson<CategorizeJsonOutput>(stdout, "hoin categorize JSON output");
}
