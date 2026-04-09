import { runCategorize } from "../cli.ts";
import { resolveAllowedPath } from "../allowed-paths.ts";
import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";
import { access, mkdir, rename } from "node:fs/promises";
import path from "node:path";

interface MoveEntry {
  from: string;
  to: string;
  class_key: string;
  confidence: number;
}

interface CategorizeOutput {
  dry_run: boolean;
  moves: MoveEntry[];
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

interface CategorizeBody {
  modelDir?: unknown;
  targetDir?: unknown;
  ja?: unknown;
  minConfidence?: unknown;
  selectedFiles?: unknown;
  moves?: unknown;
}

async function parseBody(req: Request): Promise<CategorizeBody> {
  try {
    return (await req.json()) as CategorizeBody;
  } catch {
    return {};
  }
}

function validateBody(body: CategorizeBody):
  | {
      modelDir: string;
      targetDir: string;
      ja: boolean;
      minConfidence: number;
      selectedFiles: string[];
      moves: MoveEntry[];
    }
  | { error: string } {
  if (typeof body.modelDir !== "string" || !body.modelDir) return { error: "modelDir required" };
  if (typeof body.targetDir !== "string" || !body.targetDir) return { error: "targetDir required" };
  if (
    body.selectedFiles !== undefined &&
    (!Array.isArray(body.selectedFiles) ||
      body.selectedFiles.some((file) => typeof file !== "string"))
  ) {
    return { error: "selectedFiles must be an array of paths" };
  }
  if (
    body.moves !== undefined &&
    (!Array.isArray(body.moves) ||
      body.moves.some(
        (move) =>
          !move ||
          typeof move !== "object" ||
          typeof move.from !== "string" ||
          typeof move.to !== "string" ||
          typeof move.class_key !== "string" ||
          typeof move.confidence !== "number",
      ))
  ) {
    return { error: "moves must be an array of move entries" };
  }
  return {
    modelDir: body.modelDir,
    targetDir: body.targetDir,
    ja: body.ja === true,
    minConfidence: typeof body.minConfidence === "number" ? body.minConfidence : 0.3,
    selectedFiles: (body.selectedFiles as string[] | undefined) ?? [],
    moves: (body.moves as MoveEntry[] | undefined) ?? [],
  };
}

function isWithinDirectory(candidate: string, dir: string): boolean {
  const relative = path.relative(dir, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function filterOutputBySelectedFiles(
  output: CategorizeOutput,
  selectedFiles: Set<string>,
): CategorizeOutput {
  const moves = output.moves.filter((move) => selectedFiles.has(move.from));
  const skipped = output.skipped.filter((entry) => selectedFiles.has(entry.file));
  const alreadyCategorized = output.already_categorized.filter((entry) =>
    selectedFiles.has(entry.file),
  );
  const failed = output.failed.filter((entry) => selectedFiles.has(entry.file));

  return {
    dry_run: output.dry_run,
    moves,
    skipped,
    already_categorized: alreadyCategorized,
    failed,
    summary: {
      scanned: selectedFiles.size,
      image_candidates: selectedFiles.size,
      moves: moves.length,
      routed_to_others: moves.filter((move) => move.to.includes(`${path.sep}Others${path.sep}`))
        .length,
      low_confidence_skipped: skipped.filter((entry) => entry.reason === "low_confidence").length,
      already_categorized: alreadyCategorized.length,
      failed: failed.length,
    },
  };
}

export async function handleCategorizePreview(req: Request, _url: URL): Promise<Response> {
  const body = await parseBody(req);
  const validated = validateBody(body);
  if ("error" in validated) return jsonResponse(400, validated);

  try {
    const modelDir = await resolveAllowedPath(validated.modelDir);
    const targetDir = await resolveAllowedPath(validated.targetDir);
    const selectedFiles = await Promise.all(
      validated.selectedFiles.map(async (file) => {
        const resolved = await resolveAllowedPath(file);
        if (!isWithinDirectory(resolved, targetDir)) {
          throw new Error(`selected file is outside target directory: ${resolved}`);
        }
        return resolved;
      }),
    );
    const output = await runCategorize({ ...validated, modelDir, targetDir, dryRun: true });
    const filtered =
      selectedFiles.length === 0
        ? output
        : filterOutputBySelectedFiles(output, new Set(selectedFiles));
    return jsonResponse(200, filtered);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("outside allowed roots") ? 403 : 400;
    return jsonResponse(status, { error: message });
  }
}

export async function handleCategorizeApply(req: Request, _url: URL): Promise<Response> {
  const body = await parseBody(req);
  const validated = validateBody(body);
  if ("error" in validated) return jsonResponse(400, validated);

  try {
    const targetDir = await resolveAllowedPath(validated.targetDir);
    const appliedMoves: MoveEntry[] = [];
    const failed: Array<{ file: string; reason: string }> = [];

    for (const move of validated.moves) {
      const from = await resolveAllowedPath(move.from);
      const to = path.resolve(move.to);

      if (!isWithinDirectory(from, targetDir)) {
        throw new Error(`move source is outside target directory: ${from}`);
      }
      if (!isWithinDirectory(to, targetDir)) {
        throw new Error(`move destination is outside target directory: ${to}`);
      }

      try {
        await access(to);
        failed.push({ file: from, reason: `destination already exists: ${to}` });
        continue;
      } catch {
        // Destination does not exist.
      }

      try {
        await mkdir(path.dirname(to), { recursive: true });
        await rename(from, to);
        appliedMoves.push({ ...move, from, to });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failed.push({ file: from, reason });
      }
    }

    const output: CategorizeOutput = {
      dry_run: false,
      moves: appliedMoves,
      skipped: [],
      already_categorized: [],
      failed,
      summary: {
        scanned: validated.moves.length,
        image_candidates: validated.moves.length,
        moves: appliedMoves.length,
        routed_to_others: appliedMoves.filter((move) =>
          move.to.includes(`${path.sep}Others${path.sep}`),
        ).length,
        low_confidence_skipped: 0,
        already_categorized: 0,
        failed: failed.length,
      },
    };

    session.lastOperation =
      appliedMoves.length === 0
        ? null
        : {
            moves: appliedMoves,
            timestamp: Date.now(),
          };

    return jsonResponse(200, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("outside allowed roots") ? 403 : 400;
    return jsonResponse(status, { error: message });
  }
}
