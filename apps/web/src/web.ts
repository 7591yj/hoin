import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleBrowse } from "./handlers/browse.ts";
import { handleCategorizeApply, handleCategorizePreview } from "./handlers/categorize.ts";
import { handleCategorizeProgress } from "./handlers/categorize-progress.ts";
import { handleModels } from "./handlers/models.ts";
import { handleRevert } from "./handlers/revert.ts";
import { handleSession } from "./handlers/session.ts";
import { handleThumbnail } from "./handlers/thumbnail.ts";
import { handleVersion } from "./handlers/version.ts";
import { Router } from "./router.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolvePublicDir();

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
router.on("GET", "/api/categorize/progress", handleCategorizeProgress);
router.on("POST", "/api/revert", handleRevert);
router.on("GET", "/api/session", handleSession);
router.on("GET", "/api/version", handleVersion);

function resolvePublicDir(): string {
  if (process.env.HOIN_PUBLIC_DIR) return path.resolve(process.env.HOIN_PUBLIC_DIR);

  const candidates = [
    path.resolve(process.cwd(), "public"),
    path.resolve(__dirname, "../public"),
    path.resolve(path.dirname(process.execPath), "public"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function isWithinDir(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname.startsWith("/api/")) {
    return router.handle(req);
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
  if (!isWithinDir(filePath, PUBLIC_DIR)) {
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

export function startServer(port: number, hostname = "127.0.0.1"): Bun.Server<undefined> {
  return Bun.serve({
    port,
    hostname,
    fetch: handleRequest,
  });
}
