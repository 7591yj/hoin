import { jsonResponse } from "../router.ts";
import pkg from "../../package.json";

export async function handleVersion(_req: Request, _url: URL): Promise<Response> {
  return jsonResponse(200, { version: pkg.version });
}
