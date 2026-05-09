import type { MoveEntry } from "../../types/categorize.ts";

export interface CategorizeBody {
  modelDir?: unknown;
  targetDir?: unknown;
  ja?: unknown;
  minConfidence?: unknown;
  selectedFiles?: unknown;
  moves?: unknown;
}

export type ValidatedBody = {
  modelDir: string;
  targetDir: string;
  ja: boolean;
  minConfidence: number;
  selectedFiles: string[];
  moves: MoveEntry[];
};

export async function parseBody(req: Request): Promise<CategorizeBody> {
  try {
    return (await req.json()) as CategorizeBody;
  } catch {
    return {};
  }
}

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

export function validateBody(body: CategorizeBody): ValidatedBody | { error: string } {
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
