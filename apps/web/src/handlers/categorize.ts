import { runApply, runCategorize } from "../cli.ts";
import { allowedPathErrorStatus, resolveAllowedPath } from "../allowed-paths.ts";
import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";
import type { ApplyJsonOutput, CategorizeJsonOutput, MoveEntry } from "../types/categorize.ts";
import { realpath } from "node:fs/promises";
import path from "node:path";

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

type ValidatedBody = {
  modelDir: string;
  targetDir: string;
  ja: boolean;
  minConfidence: number;
  selectedFiles: string[];
  moves: MoveEntry[];
};

function isMoveEntry(move: unknown): move is MoveEntry {
  return (
    !!move &&
    typeof move === "object" &&
    typeof (move as MoveEntry).from === "string" &&
    typeof (move as MoveEntry).to === "string" &&
    typeof (move as MoveEntry).class_key === "string" &&
    typeof (move as MoveEntry).confidence === "number" &&
    Number.isFinite((move as MoveEntry).confidence) &&
    ((move as MoveEntry).routed_to_others === undefined ||
      typeof (move as MoveEntry).routed_to_others === "boolean")
  );
}

function validateBody(body: CategorizeBody): ValidatedBody | { error: string } {
  if (typeof body.modelDir !== "string" || !body.modelDir) return { error: "modelDir required" };
  if (typeof body.targetDir !== "string" || !body.targetDir) return { error: "targetDir required" };

  const minConfidence = body.minConfidence ?? 0.3;
  if (
    typeof minConfidence !== "number" ||
    !Number.isFinite(minConfidence) ||
    minConfidence < 0 ||
    minConfidence > 1
  ) {
    return { error: "minConfidence must be a finite number between 0.0 and 1.0" };
  }

  if (
    body.selectedFiles !== undefined &&
    (!Array.isArray(body.selectedFiles) ||
      body.selectedFiles.some((file) => typeof file !== "string"))
  ) {
    return { error: "selectedFiles must be an array of paths" };
  }
  if (
    body.moves !== undefined &&
    (!Array.isArray(body.moves) || body.moves.some((move) => !isMoveEntry(move)))
  ) {
    return { error: "moves must be an array of move entries" };
  }
  return {
    modelDir: body.modelDir,
    targetDir: body.targetDir,
    ja: body.ja === true,
    minConfidence,
    selectedFiles: (body.selectedFiles as string[] | undefined) ?? [],
    moves: (body.moves as MoveEntry[] | undefined) ?? [],
  };
}

function isWithinDirectory(candidate: string, dir: string): boolean {
  const relative = path.relative(dir, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function countOthersMoves(moves: MoveEntry[]): number {
  return moves.filter((move) => move.routed_to_others === true).length;
}

function applyPlanForMoves(moves: MoveEntry[]): CategorizeJsonOutput {
  return {
    dry_run: true,
    moves,
    skipped: [],
    already_categorized: [],
    failed: [],
    summary: {
      scanned: 0,
      image_candidates: 0,
      moves: moves.length,
      routed_to_others: countOthersMoves(moves),
      low_confidence_skipped: 0,
      already_categorized: 0,
      failed: 0,
    },
  };
}

function applyOutputForMoves(moves: MoveEntry[]): ApplyJsonOutput {
  return {
    moves,
    summary: {
      applied: moves.length,
      routed_to_others: countOthersMoves(moves),
    },
  };
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

async function resolveMove(move: MoveEntry, targetDir: string): Promise<MoveEntry> {
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

function setApplyProgress(
  completed: number,
  total: number | null,
  state: "running" | "done" = "running",
  message?: string,
) {
  session.categorizeProgress = {
    phase: "apply",
    state,
    completed,
    total,
    message:
      message ??
      (state === "done"
        ? `Applied ${completed} move(s).`
        : `Applying ${completed}/${total ?? "?"} move(s)…`),
    startedAt: session.categorizeProgress.startedAt ?? Date.now(),
    updatedAt: Date.now(),
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
    session.categorizeProgress = {
      phase: "preview",
      state: "running",
      completed: 0,
      total: selectedFiles.length > 0 ? selectedFiles.length : null,
      message:
        selectedFiles.length > 0
          ? `Categorizing ${selectedFiles.length} selected image(s)…`
          : "Categorizing images…",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    const output = await runCategorize({
      ...validated,
      modelDir,
      targetDir,
      dryRun: true,
      selectedFiles,
      onProgress: (event) => {
        session.categorizeProgress = {
          phase: "preview",
          state: "running",
          completed: event.completed,
          total: event.total,
          message: `Categorizing ${event.completed}/${event.total} image(s)…`,
          startedAt: session.categorizeProgress.startedAt,
          updatedAt: Date.now(),
        };
      },
    });
    session.categorizeProgress = {
      phase: "preview",
      state: "done",
      completed: output.summary.scanned,
      total: output.summary.scanned,
      message: `Prepared ${output.summary.moves} move(s) from ${output.summary.scanned} scanned image(s).`,
      startedAt: session.categorizeProgress.startedAt,
      updatedAt: Date.now(),
    };
    return jsonResponse(200, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.categorizeProgress = {
      phase: "preview",
      state: "error",
      completed: 0,
      total: null,
      message,
      startedAt: session.categorizeProgress.startedAt,
      updatedAt: Date.now(),
    };
    return jsonResponse(allowedPathErrorStatus(error, 400), { error: message });
  }
}

export async function handleCategorizeApply(req: Request, _url: URL): Promise<Response> {
  const body = await parseBody(req);
  const validated = validateBody(body);
  if ("error" in validated) return jsonResponse(400, validated);

  try {
    const targetDir = await resolveAllowedPath(validated.targetDir);
    const resolvedMoves: MoveEntry[] = [];
    setApplyProgress(0, null, "running", "Validating move plan…");

    for (const move of validated.moves) {
      resolvedMoves.push(await resolveMove(move, targetDir));
    }

    setApplyProgress(0, resolvedMoves.length);
    const operation = await runApply(applyPlanForMoves(resolvedMoves), (event) => {
      setApplyProgress(event.completed, event.total);
    });
    const appliedMoves = operation.moves;
    const output = applyOutputForMoves(appliedMoves);

    session.lastOperation =
      appliedMoves.length === 0
        ? null
        : {
            moves: appliedMoves,
            timestamp: Date.now(),
          };
    setApplyProgress(appliedMoves.length, validated.moves.length, "done");

    return jsonResponse(200, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.categorizeProgress = {
      phase: "apply",
      state: "error",
      completed: 0,
      total: validated.moves.length,
      message,
      startedAt: session.categorizeProgress.startedAt,
      updatedAt: Date.now(),
    };
    return jsonResponse(allowedPathErrorStatus(error, 400), { error: message });
  }
}
