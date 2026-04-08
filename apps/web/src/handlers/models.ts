import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { jsonResponse } from "../router.ts";

export async function handleModels(_req: Request, url: URL): Promise<Response> {
  const root = url.searchParams.get("root") ?? "";
  if (!root) return jsonResponse(200, { models: [] });

  if (!existsSync(root)) {
    return jsonResponse(400, { error: "directory not found" });
  }

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return jsonResponse(400, { error: "failed to read directory" });
  }

  const models: Array<{ name: string; path: string }> = [];
  for (const entry of entries) {
    const dir = path.join(root, entry);
    const hasOnnx = existsSync(path.join(dir, `${entry}.onnx`));
    const hasManifest = existsSync(path.join(dir, "hoin-model.json"));
    if (hasOnnx || hasManifest) {
      models.push({ name: entry, path: dir });
    }
  }

  return jsonResponse(200, { models });
}
