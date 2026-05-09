import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import decodeJpeg, { init as initJpegDecoder } from "@jsquash/jpeg/decode.js";
import jpegDecoderWasm from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm" with { type: "file" };
import decodePng, { init as initPngDecoder } from "@jsquash/png/decode.js";
import decodeWebp, { init as initWebpDecoder } from "@jsquash/webp/decode.js";
import encodeWebp, { init as initWebpEncoder } from "@jsquash/webp/encode.js";
import webpDecoderWasm from "@jsquash/webp/codec/dec/webp_dec.wasm" with { type: "file" };
import webpEncoderWasm from "@jsquash/webp/codec/enc/webp_enc.wasm" with { type: "file" };
import { allowedPathErrorStatus, resolveAllowedPath } from "../allowed-paths.ts";

const THUMBNAIL_SOURCE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ORIGINAL_IMAGE_EXTENSIONS = new Set([".gif", ".bmp", ".tiff", ".tif"]);
const THUMBNAIL_SIZE = 320;
const THUMBNAIL_FORMAT = "webp";
const THUMBNAIL_QUALITY = 75;
const CACHE_DIR = path.join(tmpdir(), `hoin-web-thumbnails-${process.getuid?.() ?? "unknown"}`);
const PNG_DECODER_WASM = new URL(import.meta.resolve("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"));
let codecsReady: Promise<void> | undefined;

export async function handleThumbnail(req: Request, url: URL): Promise<Response> {
  const filePath = url.searchParams.get("path") ?? "";
  if (!filePath) return new Response("path required", { status: 400 });

  let allowedFilePath: string;
  try {
    allowedFilePath = await resolveAllowedPath(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(message, { status: allowedPathErrorStatus(error, 404) });
  }

  let fileStat: Stats;
  try {
    fileStat = await stat(allowedFilePath);
  } catch {
    return new Response("not found", { status: 404 });
  }
  if (!fileStat.isFile()) return new Response("not found", { status: 404 });

  const ext = path.extname(allowedFilePath).toLowerCase();
  const canGenerateThumbnail = THUMBNAIL_SOURCE_EXTENSIONS.has(ext);
  const shouldServeOriginal = ORIGINAL_IMAGE_EXTENSIONS.has(ext);
  if (!canGenerateThumbnail && !shouldServeOriginal) {
    return new Response("thumbnail format not supported", { status: 415 });
  }

  const cacheKey = thumbnailCacheKey(allowedFilePath, fileStat);
  const etag = `"${cacheKey}"`;

  if (shouldServeOriginal) {
    const headers = imageHeaders(etag, contentTypeForExtension(ext));
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(Bun.file(allowedFilePath), { headers });
  }

  const headers = imageHeaders(etag, "image/webp");
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const cachedPath = path.join(CACHE_DIR, `${cacheKey}.${THUMBNAIL_FORMAT}`);
  try {
    await mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
    if (!(await pathExists(cachedPath))) {
      await generateThumbnail(allowedFilePath, ext, cachedPath);
    }
  } catch (error) {
    logThumbnailError(error);
    return new Response("failed to generate thumbnail", { status: 500 });
  }

  return new Response(Bun.file(cachedPath), { headers });
}

function thumbnailCacheKey(filePath: string, fileStat: Stats): string {
  return createHash("sha256")
    .update(filePath)
    .update("\0")
    .update(String(fileStat.size))
    .update("\0")
    .update(String(fileStat.mtimeMs))
    .update("\0")
    .update(String(THUMBNAIL_SIZE))
    .update("\0")
    .update(THUMBNAIL_FORMAT)
    .digest("hex");
}

function imageHeaders(etag: string, contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
  };
}

function contentTypeForExtension(ext: string): string {
  switch (ext) {
    case ".bmp":
      return "image/bmp";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function logThumbnailError(error: unknown): void {
  if (process.env.HOIN_DEBUG) {
    console.error("Failed to generate thumbnail", error);
    return;
  }

  console.error("Failed to generate thumbnail. Set HOIN_DEBUG=1 for details.");
}

function ensureCodecsReady(): Promise<void> {
  codecsReady ??= initCodecs();
  return codecsReady;
}

async function initCodecs(): Promise<void> {
  const [webpDecoderModule, webpEncoderModule, jpegDecoderBinary, pngDecoderModule] =
    await Promise.all([
      compileWasmFile(webpDecoderWasm),
      compileWasmFile(webpEncoderWasm),
      Bun.file(jpegDecoderWasm).arrayBuffer(),
      compileWasmFile(PNG_DECODER_WASM),
    ]);
  await Promise.all([
    initJpegDecoder({ wasmBinary: jpegDecoderBinary }),
    initPngDecoder(pngDecoderModule),
    initWebpDecoder(webpDecoderModule),
    initWebpEncoder(webpEncoderModule),
  ]);
}

async function compileWasmFile(filePath: string | URL): Promise<WebAssembly.Module> {
  return WebAssembly.compile(await Bun.file(filePath).arrayBuffer());
}

async function generateThumbnail(
  inputPath: string,
  ext: string,
  outputPath: string,
): Promise<void> {
  await ensureCodecsReady();
  const source = await decodeImage(inputPath, ext);
  const resized = resizeToFit(source, THUMBNAIL_SIZE);
  const encoded = await encodeWebp(resized, { quality: THUMBNAIL_QUALITY });
  await writeFile(outputPath, new Uint8Array(encoded));
}

async function decodeImage(inputPath: string, ext: string): Promise<ImageData> {
  const data = await Bun.file(inputPath).arrayBuffer();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return decodeJpeg(data);
    case ".png":
      return decodePng(data);
    case ".webp":
      return decodeWebp(data);
    default:
      throw new Error(`unsupported thumbnail format: ${ext}`);
  }
}

function resizeToFit(source: ImageData, maxSize: number): ImageData {
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  if (width === source.width && height === source.height) return source;

  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / scale));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      data.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }

  return new ImageData(data, width, height);
}
