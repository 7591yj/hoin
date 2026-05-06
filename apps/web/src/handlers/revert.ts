import { runRevert } from "../cli.ts";
import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";

export async function handleRevert(_req: Request, _url: URL): Promise<Response> {
  if (!session.lastOperation) {
    return jsonResponse(400, { error: "no operation to revert" });
  }

  try {
    const result = await runRevert({ moves: session.lastOperation.moves });
    session.lastOperation = null;
    return jsonResponse(200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(500, { error: message });
  }
}
