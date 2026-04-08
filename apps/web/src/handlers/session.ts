import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";

export async function handleSession(_req: Request, _url: URL): Promise<Response> {
  return jsonResponse(200, {
    hasLastOperation: session.lastOperation !== null,
    moveCount: session.lastOperation?.moves.length ?? 0,
  });
}
