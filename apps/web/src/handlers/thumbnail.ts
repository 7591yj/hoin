import { existsSync } from "node:fs";
import path from "node:path";
import { resolveAllowedPath } from "../allowed-paths.ts";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".webp": "image/webp",
};

export async function handleThumbnail(_req: Request, url: URL): Promise<Response> {
  const filePath = url.searchParams.get("path") ?? "";
  if (!filePath) return new Response("path required", { status: 400 });

  let allowedFilePath: string;
  try {
    allowedFilePath = await resolveAllowedPath(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("outside allowed roots") ? 403 : 404;
    return new Response(message, { status });
  }

  if (!existsSync(allowedFilePath)) return new Response("not found", { status: 404 });

  const ext = path.extname(allowedFilePath).toLowerCase();
  const contentType = MIME[ext];
  if (!contentType) return new Response("not an image", { status: 400 });

  return new Response(Bun.file(allowedFilePath), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "max-age=3600",
    },
  });
}
