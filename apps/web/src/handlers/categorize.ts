import { runApply, runCategorize } from "../cli.ts";
import { allowedPathErrorStatus, resolveAllowedPath } from "../allowed-paths.ts";
import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";
import type { MoveEntry } from "../types/categorize.ts";
import { applyOutputForMoves, applyPlanForMoves } from "./categorize/output.ts";
import { resolveMove, resolveSelectedFiles } from "./categorize/paths.ts";
import {
  setApplyErrorProgress,
  setApplyProgress,
  setPreviewDoneProgress,
  setPreviewErrorProgress,
  setPreviewProgress,
  setPreviewRunningProgress,
} from "./categorize/progress.ts";
import { parseBody, validateBody } from "./categorize/validation.ts";

export async function handleCategorizePreview(req: Request, _url: URL): Promise<Response> {
  const body = await parseBody(req);
  const validated = validateBody(body);
  if ("error" in validated) return jsonResponse(400, validated);

  try {
    const modelDir = await resolveAllowedPath(validated.modelDir);
    const targetDir = await resolveAllowedPath(validated.targetDir);
    const selectedFiles = await resolveSelectedFiles(validated.selectedFiles, targetDir);

    setPreviewRunningProgress(selectedFiles);
    const output = await runCategorize({
      ...validated,
      modelDir,
      targetDir,
      dryRun: true,
      selectedFiles,
      onProgress: (event) => {
        setPreviewProgress(event.completed, event.total);
      },
    });
    setPreviewDoneProgress(output.summary.scanned, output.summary.moves);
    return jsonResponse(200, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setPreviewErrorProgress(message);
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
    setApplyErrorProgress(message, validated.moves.length);
    return jsonResponse(allowedPathErrorStatus(error, 400), { error: message });
  }
}
