import { runRevert } from "../cli.ts";
import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";

function setRevertProgress(
  completed: number,
  total: number | null,
  state: "running" | "done" = "running",
  message?: string,
) {
  session.categorizeProgress = {
    phase: "revert",
    state,
    completed,
    total,
    message:
      message ??
      (state === "done"
        ? `Reverted ${completed} move(s).`
        : `Reverting ${completed}/${total ?? "?"} move(s)…`),
    startedAt: session.categorizeProgress.startedAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}

export async function handleRevert(_req: Request, _url: URL): Promise<Response> {
  if (!session.lastOperation) {
    return jsonResponse(400, { error: "no operation to revert" });
  }

  const total = session.lastOperation.moves.length;
  setRevertProgress(0, total);

  try {
    const result = await runRevert({ moves: session.lastOperation.moves }, (event) => {
      setRevertProgress(event.completed, event.total);
    });
    session.lastOperation = null;
    setRevertProgress(result.reverted, total, "done");
    return jsonResponse(200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    session.categorizeProgress = {
      phase: "revert",
      state: "error",
      completed: 0,
      total,
      message,
      startedAt: session.categorizeProgress.startedAt,
      updatedAt: Date.now(),
    };
    return jsonResponse(500, { error: message });
  }
}
