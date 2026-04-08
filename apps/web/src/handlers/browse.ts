import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { jsonResponse } from "../router.ts";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp"]);

export async function handleBrowse(_req: Request, url: URL): Promise<Response> {
  const dirPath = url.searchParams.get("path") ?? "";
  if (!dirPath) return jsonResponse(400, { error: "path required" });

  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return jsonResponse(400, { error: "failed to read directory" });
  }

  const result = await Promise.all(
    entries.map(async (name) => {
      const full = path.join(dirPath, name);
      const info = await stat(full).catch(() => null);
      const isDir = info?.isDirectory() ?? false;
      const ext = path.extname(name).toLowerCase();
      return { name, path: full, isDir, isImage: IMAGE_EXTS.has(ext) };
    }),
  );

  // Include dirs and image files only
  const filtered = result.filter((e) => e.isDir || e.isImage);
  return jsonResponse(200, { entries: filtered });
}
