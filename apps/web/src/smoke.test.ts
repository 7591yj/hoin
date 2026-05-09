import { afterAll, beforeAll, expect, test } from "bun:test";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApplyJsonOutput, CategorizeResult } from "./types/categorize.ts";
import { handleRequest } from "./web.ts";
import { workspaceVersion } from "./version.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const smokeDir = path.join(repoRoot, ".tmp", "hoin-smoke");
const sampleNameA = "sample-a.webp";
const sampleNameB = "sample-b.webp";
const samplePathA = path.join(smokeDir, sampleNameA);
const samplePathB = path.join(smokeDir, sampleNameB);
const forbiddenPath = "/tmp/hoin-forbidden.png";
const modelsRoot = path.join(repoRoot, "models");
const modelDir = path.join(modelsRoot, "holo-hoin");
const hoinBin = path.join(repoRoot, "target/debug/hoin");
const sampleWebp = Buffer.from(
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=",
  "base64",
);
const previousHoinBin = process.env.HOIN_BIN;

beforeAll(async () => {
  await access(hoinBin);
  process.env.HOIN_BIN = hoinBin;
});

afterAll(async () => {
  await rm(smokeDir, { recursive: true, force: true });
  await rm(forbiddenPath, { force: true });
  if (previousHoinBin === undefined) {
    delete process.env.HOIN_BIN;
  } else {
    process.env.HOIN_BIN = previousHoinBin;
  }
});

test("web smoke test exercises CLI integration against /tmp/hoin-smoke", async () => {
  await resetSmokeDir();

  const home = await request("/");
  expect(home.status).toBe(200);
  expect(await home.text()).toContain("<title>hoin</title>");

  const version = await getJson("/api/version", isVersionResponse);
  expect(version.version).toBe(workspaceVersion);

  const models = await getJson(
    `/api/models?root=${encodeURIComponent(modelsRoot)}`,
    isModelsResponse,
  );
  expect(models.models.some((entry) => entry.path === modelDir)).toBe(true);

  const browse = await getJson(
    `/api/browse?path=${encodeURIComponent(smokeDir)}`,
    isBrowseResponse,
  );
  expect(browse.entries).toContainEqual({
    name: sampleNameA,
    path: samplePathA,
    isDir: false,
    isImage: true,
  });
  expect(browse.entries).toContainEqual({
    name: sampleNameB,
    path: samplePathB,
    isDir: false,
    isImage: true,
  });

  const thumbnailPath = `/api/thumbnail?path=${encodeURIComponent(samplePathA)}`;
  const thumbnail = await request(thumbnailPath);
  expect(thumbnail.status).toBe(200);
  expect(thumbnail.headers.get("content-type")).toBe("image/webp");
  const etag = thumbnail.headers.get("etag");
  expect(etag).toBeTruthy();

  const cachedThumbnail = await request(thumbnailPath, {
    headers: { "If-None-Match": etag ?? "" },
  });
  expect(cachedThumbnail.status).toBe(304);

  const previewAll = await postJson("/api/categorize/preview", isCategorizeResult, {
    modelDir,
    targetDir: smokeDir,
    minConfidence: 0,
  });
  expect(previewAll.dry_run).toBe(true);
  expect(previewAll.failed).toHaveLength(0);
  expect(previewAll.summary.scanned).toBe(2);
  expect(previewAll.moves).toHaveLength(2);
  expect(previewAll.moves.map((move) => move.from).sort()).toEqual([samplePathA, samplePathB]);
  expect(await pathExists(samplePathA)).toBe(true);
  expect(await pathExists(samplePathB)).toBe(true);

  const previewSelected = await postJson("/api/categorize/preview", isCategorizeResult, {
    modelDir,
    targetDir: smokeDir,
    minConfidence: 0,
    selectedFiles: [samplePathA],
  });
  expect(previewSelected.dry_run).toBe(true);
  expect(previewSelected.failed).toHaveLength(0);
  expect(previewSelected.summary.scanned).toBe(1);
  expect(previewSelected.moves).toHaveLength(1);
  expect(previewSelected.moves[0]?.from).toBe(samplePathA);

  const apply = await postJson("/api/categorize/apply", isApplyJsonOutput, {
    modelDir,
    targetDir: smokeDir,
    minConfidence: 0,
    moves: previewSelected.moves,
  });
  expect(apply.summary).toEqual({ applied: 1, routed_to_others: 0 });
  expect(apply.moves).toHaveLength(1);
  const appliedMove = apply.moves[0];
  if (!appliedMove) {
    throw new Error("expected categorize/apply to return one move");
  }
  expect(appliedMove.from).toBe(samplePathA);
  expect(appliedMove.to).toBe(previewSelected.moves[0]?.to);
  expect(await pathExists(samplePathA)).toBe(false);
  expect(await pathExists(samplePathB)).toBe(true);
  expect(await pathExists(appliedMove.to)).toBe(true);

  const session = await getJson("/api/session", isSessionResponse);
  expect(session).toEqual({ hasLastOperation: true, moveCount: 1 });

  const revert = await postJson("/api/revert", isRevertResponse);
  expect(revert).toEqual({ reverted: 1 });
  expect(await pathExists(samplePathA)).toBe(true);
  expect(await pathExists(samplePathB)).toBe(true);
  expect(await pathExists(appliedMove.to)).toBe(false);

  const clearedSession = await getJson("/api/session", isSessionResponse);
  expect(clearedSession).toEqual({ hasLastOperation: false, moveCount: 0 });
});

test("web API rejects paths outside allowed roots", async () => {
  await writeFile(forbiddenPath, sampleWebp);

  const browse = await request("/api/browse?path=%2Ftmp");
  expect(browse.status).toBe(403);

  const thumbnail = await request(`/api/thumbnail?path=${encodeURIComponent(forbiddenPath)}`);
  expect(thumbnail.status).toBe(403);
});

async function resetSmokeDir(): Promise<void> {
  await rm(smokeDir, { recursive: true, force: true });
  await mkdir(smokeDir, { recursive: true });
  await writeFile(samplePathA, sampleWebp);
  await writeFile(samplePathB, sampleWebp);
}

type VersionResponse = { version: string };
type ModelsResponse = { models: Array<{ name: string; path: string }> };
type BrowseEntry = { name: string; path: string; isDir: boolean; isImage: boolean };
type BrowseResponse = { entries: BrowseEntry[] };
type SessionResponse = { hasLastOperation: boolean; moveCount: number };
type RevertResponse = { reverted: number };

async function getJson<T>(
  pathname: string,
  isExpectedJson: (value: unknown) => value is T,
): Promise<T> {
  return readJsonResponse(pathname, await request(pathname), isExpectedJson);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVersionResponse(value: unknown): value is VersionResponse {
  return isRecord(value) && typeof value.version === "string";
}

function isModelsResponse(value: unknown): value is ModelsResponse {
  return isRecord(value) && Array.isArray(value.models) && value.models.every(isModelEntry);
}

function isModelEntry(value: unknown): value is ModelsResponse["models"][number] {
  return isRecord(value) && typeof value.name === "string" && typeof value.path === "string";
}

function isBrowseResponse(value: unknown): value is BrowseResponse {
  return isRecord(value) && Array.isArray(value.entries) && value.entries.every(isBrowseEntry);
}

function isBrowseEntry(value: unknown): value is BrowseEntry {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.path === "string" &&
    typeof value.isDir === "boolean" &&
    typeof value.isImage === "boolean"
  );
}

function isSessionResponse(value: unknown): value is SessionResponse {
  return (
    isRecord(value) &&
    typeof value.hasLastOperation === "boolean" &&
    typeof value.moveCount === "number"
  );
}

function isRevertResponse(value: unknown): value is RevertResponse {
  return isRecord(value) && typeof value.reverted === "number";
}

function isCategorizeResult(value: unknown): value is CategorizeResult {
  return (
    isRecord(value) &&
    typeof value.dry_run === "boolean" &&
    isRecord(value.summary) &&
    typeof value.summary.scanned === "number" &&
    Array.isArray(value.moves) &&
    value.moves.every(isMove) &&
    Array.isArray(value.failed)
  );
}

function isApplyJsonOutput(value: unknown): value is ApplyJsonOutput {
  return (
    isRecord(value) &&
    isRecord(value.summary) &&
    typeof value.summary.applied === "number" &&
    typeof value.summary.routed_to_others === "number" &&
    Array.isArray(value.moves) &&
    value.moves.every(isMove)
  );
}

function isMove(value: unknown): value is CategorizeResult["moves"][number] {
  return isRecord(value) && typeof value.from === "string" && typeof value.to === "string";
}

async function postJson<T>(
  pathname: string,
  isExpectedJson: (value: unknown) => value is T,
  body?: unknown,
): Promise<T> {
  const response = await request(pathname, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJsonResponse(pathname, response, isExpectedJson);
}

async function readJsonResponse<T>(
  pathname: string,
  response: Response,
  isExpectedJson: (value: unknown) => value is T,
): Promise<T> {
  expect(response.ok).toBe(true);
  const json: unknown = await response.json();
  if (!isExpectedJson(json)) {
    throw new Error(`unexpected JSON response for ${pathname}`);
  }
  return json;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function request(pathname: string, init?: RequestInit): Promise<Response> {
  return handleRequest(new Request(`http://smoke.test${pathname}`, init));
}
