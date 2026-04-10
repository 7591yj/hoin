import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveAllowedPath } from "../allowed-paths.ts";
import { jsonResponse } from "../router.ts";

export async function handleModels(_req: Request, url: URL): Promise<Response> {
  const root = url.searchParams.get("root") ?? "";
  if (!root) return jsonResponse(200, { models: [] });

  let allowedRoot: string;
  try {
    allowedRoot = await resolveAllowedPath(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("outside allowed roots") ? 403 : 400;
    return jsonResponse(status, { error: message });
  }

  let entries: string[];
  try {
    entries = await readdir(allowedRoot);
  } catch {
    return jsonResponse(400, { error: "failed to read directory" });
  }

  const models: Array<{ name: string; path: string }> = [];
  for (const entry of entries) {
    const dir = path.join(allowedRoot, entry);
    const hasOnnx = existsSync(path.join(dir, `${entry}.onnx`));
    const hasManifest = existsSync(path.join(dir, "hoin-model.json"));
    if (hasOnnx || hasManifest) {
      models.push({ name: entry, path: dir });
    }
  }

  return jsonResponse(200, { models });
}
