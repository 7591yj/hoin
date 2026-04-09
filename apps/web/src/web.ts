import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Router } from "./router.ts";
import { handleModels } from "./handlers/models.ts";
import { handleBrowse } from "./handlers/browse.ts";
import { handleThumbnail } from "./handlers/thumbnail.ts";
import { handleCategorizePreview, handleCategorizeApply } from "./handlers/categorize.ts";
import { handleRevert } from "./handlers/revert.ts";
import { handleSession } from "./handlers/session.ts";
import { handleVersion } from "./handlers/version.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
};

const router = new Router();
router.on("GET", "/api/models", handleModels);
router.on("GET", "/api/browse", handleBrowse);
router.on("GET", "/api/thumbnail", handleThumbnail);
router.on("POST", "/api/categorize/preview", handleCategorizePreview);
router.on("POST", "/api/categorize/apply", handleCategorizeApply);
router.on("POST", "/api/revert", handleRevert);
router.on("GET", "/api/session", handleSession);
router.on("GET", "/api/version", handleVersion);

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname.startsWith("/api/")) {
    return router.handle(req);
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  const info = await stat(filePath);
  if (info.isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] ?? "application/octet-stream";
  return new Response(Bun.file(filePath), { headers: { "Content-Type": contentType } });
}

export function startServer(port: number): Bun.Server {
  return Bun.serve({
    port,
    fetch: handleRequest,
  });
}
