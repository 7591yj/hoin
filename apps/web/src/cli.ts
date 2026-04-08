import path from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function resolveBin(): Promise<string> {
  if (process.env.HOIN_BIN) return process.env.HOIN_BIN;

  const relPath = path.resolve(__dirname, "../../..", "target/release/hoin");
  try {
    await access(relPath);
    return relPath;
  } catch {
    // fall through to PATH
  }

  return "hoin";
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

export interface CategorizeOptions {
  modelDir: string;
  targetDir: string;
  dryRun: boolean;
  ja?: boolean;
  minConfidence?: number;
}

export async function runCategorize(opts: CategorizeOptions): Promise<CategorizeJsonOutput> {
  const bin = await resolveBin();

  const args = [
    "categorize",
    "--model-dir",
    opts.modelDir,
    "--json",
    ...(opts.dryRun ? ["--dry-run"] : []),
    ...(opts.ja ? ["--ja"] : []),
    ...(opts.minConfidence !== undefined ? ["--min-confidence", String(opts.minConfidence)] : []),
    opts.targetDir,
  ];

  const proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`hoin exited with code ${exitCode}: ${stderr}`);
  }

  try {
    return JSON.parse(stdout) as CategorizeJsonOutput;
  } catch {
    throw new Error(`Failed to parse hoin JSON output: ${stdout}`);
  }
}
