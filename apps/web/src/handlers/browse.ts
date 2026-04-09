import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { jsonResponse } from "../router.ts";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp"]);

async function collectEntries(
  dirPath: string,
  recursive: boolean,
): Promise<Array<{ name: string; path: string; isDir: boolean; isImage: boolean }>> {
  let names: string[];
  try {
    names = await readdir(dirPath);
  } catch {
    return [];
  }

  const result = await Promise.all(
    names.map(async (name) => {
      const full = path.join(dirPath, name);
      const info = await stat(full).catch(() => null);
      const isDir = info?.isDirectory() ?? false;
      const ext = path.extname(name).toLowerCase();
      return { name, path: full, isDir, isImage: IMAGE_EXTS.has(ext) };
    }),
  );

  if (!recursive) {
    return result.filter((e) => e.isDir || e.isImage);
  }

  const all: typeof result = [];
  for (const entry of result) {
    if (entry.isDir) {
      all.push(entry);
      const children = await collectEntries(entry.path, true);
      all.push(...children);
    } else if (entry.isImage) {
      all.push(entry);
    }
  }
  return all;
}

export async function handleBrowse(_req: Request, url: URL): Promise<Response> {
  const dirPath = url.searchParams.get("path") ?? "";
  if (!dirPath) return jsonResponse(400, { error: "path required" });

  const recursive = url.searchParams.get("recursive") === "1";
  const entries = await collectEntries(dirPath, recursive);
  return jsonResponse(200, { entries });
}
