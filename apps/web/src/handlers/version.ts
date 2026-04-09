import { jsonResponse } from "../router.ts";
import { workspaceVersion } from "../version.ts";

export async function handleVersion(_req: Request, _url: URL): Promise<Response> {
  return jsonResponse(200, { version: workspaceVersion });
}
