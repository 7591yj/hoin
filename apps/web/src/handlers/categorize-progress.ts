import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";

export function handleCategorizeProgress(_req: Request, _url: URL): Response {
  return jsonResponse(200, session.categorizeProgress);
}
