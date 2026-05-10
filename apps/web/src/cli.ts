import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOIN_BINARY = process.platform === "win32" ? "hoin.exe" : "hoin";

async function resolveBin(): Promise<string> {
  if (process.env.HOIN_BIN) return process.env.HOIN_BIN;

  const candidates = [
    path.resolve(process.cwd(), HOIN_BINARY),
    path.resolve(__dirname, "../../..", "target/debug/hoin"),
    path.resolve(__dirname, "../../..", "target/release/hoin"),
    path.resolve(path.dirname(process.execPath), HOIN_BINARY),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return HOIN_BINARY;
}

export interface CategorizeJsonOutput {
  dry_run: boolean;
  moves: Array<{ from: string; to: string; class_key: string; confidence: number }>;
  skipped: Array<{ file: string; reason: string; confidence?: number }>;
  already_categorized: Array<{ file: string }>;
  failed: Array<{ file: string; reason: string }>;
  summary: {
    scanned: number;
    image_candidates: number;
    moves: number;
    routed_to_others: number;
    low_confidence_skipped: number;
    already_categorized: number;
    failed: number;
  };
}

export interface CategorizeProgressEvent {
  event: "file_done";
  completed: number;
  total: number;
  file: string;
}

export interface CategorizeOptions {
  modelDir: string;
  targetDir: string;
  dryRun: boolean;
  ja?: boolean;
  minConfidence?: number;
  selectedFiles?: string[];
  onProgress?: (event: CategorizeProgressEvent) => void;
}

export interface OperationJsonOutput {
  moves: Array<{ from: string; to: string; class_key: string; confidence: number }>;
}

export async function runApply(plan: CategorizeJsonOutput): Promise<OperationJsonOutput> {
  return runJsonFileCommand<CategorizeJsonOutput, OperationJsonOutput>("apply", "plan", plan);
}

export async function runRevert(operation: OperationJsonOutput): Promise<{ reverted: number }> {
  return runJsonFileCommand<OperationJsonOutput, { reverted: number }>(
    "revert",
    "operation",
    operation,
  );
}

async function runJsonFileCommand<TInput, TOutput>(
  command: "apply" | "revert",
  fileStem: string,
  payload: TInput,
): Promise<TOutput> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `hoin-${command}-`));
  const jsonPath = path.join(tempDir, `${fileStem}.json`);
  try {
    await writeFile(jsonPath, JSON.stringify(payload), "utf8");
    const { stdout } = await runHoin([command, jsonPath]);
    return JSON.parse(stdout) as TOutput;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runHoin(
  args: string[],
  readStderrStream: (stderr: ReadableStream<Uint8Array>) => Promise<string> = (stderr) =>
    new Response(stderr).text(),
): Promise<{ stdout: string; stderr: string }> {
  const bin = await resolveBin();
  const proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    readStderrStream(proc.stderr),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`hoin exited with code ${exitCode}: ${stderr}`);
  return { stdout, stderr };
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

  try {
    return JSON.parse(stdout) as CategorizeJsonOutput;
  } catch {
    throw new Error(`Failed to parse hoin JSON output: ${stdout}`);
  }
}

async function readStderr(
  stderr: ReadableStream<Uint8Array>,
  onProgress?: (event: CategorizeProgressEvent) => void,
): Promise<string> {
  if (!onProgress) return new Response(stderr).text();

  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  let stderrText = "";
  let bufferedLine = "";

  const handleLine = (line: string): void => {
    if (!emitProgressEvent(line, onProgress)) stderrText += `${line}\n`;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    bufferedLine += decoder.decode(value, { stream: true });

    const lines = bufferedLine.split(/\r?\n/);
    bufferedLine = lines.pop() ?? "";
    for (const line of lines) {
      handleLine(line);
    }
  }

  bufferedLine += decoder.decode();
  if (bufferedLine) handleLine(bufferedLine);

  return stderrText;
}

function emitProgressEvent(
  line: string,
  onProgress: (event: CategorizeProgressEvent) => void,
): boolean {
  try {
    const event = JSON.parse(line) as Partial<CategorizeProgressEvent>;
    if (
      event.event === "file_done" &&
      typeof event.completed === "number" &&
      typeof event.total === "number" &&
      typeof event.file === "string"
    ) {
      onProgress({
        event: "file_done",
        completed: event.completed,
        total: event.total,
        file: event.file,
      });
      return true;
    }
  } catch {
    // Keep non-JSON stderr for error reporting.
  }
  return false;
}
