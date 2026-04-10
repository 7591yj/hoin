import { afterAll, beforeAll, expect, test } from "bun:test";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { handleRequest } from "./web.ts";
import { workspaceVersion } from "./version.ts";

interface MoveEntry {
  from: string;
  to: string;
  class_key: string;
  confidence: number;
}

interface CategorizeResult {
  dry_run: boolean;
  moves: MoveEntry[];
  skipped: Array<{ file: string; reason: string; confidence?: number }>;
  already_categorized: Array<{ file: string }>;
  failed: Array<{ file: string; reason: string }>;
  summary: {
    scanned: number;
    image_candidates: number;
    moves: number;
    routed_to_others: number;
    low_confidence_skipped: number;
    already_categorized: number;
    failed: number;
  };
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const smokeDir = path.join(repoRoot, ".tmp", "hoin-smoke");
const sampleNameA = "sample-a.gif";
const sampleNameB = "sample-b.gif";
const samplePathA = path.join(smokeDir, sampleNameA);
const samplePathB = path.join(smokeDir, sampleNameB);
const forbiddenPath = "/tmp/hoin-forbidden.png";
const modelsRoot = path.join(repoRoot, "models");
const modelDir = path.join(modelsRoot, "holo-hoin");
const hoinBin = path.join(repoRoot, "target/debug/hoin");
const sampleGif = Buffer.from("R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=", "base64");
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

  const version = await getJson<{ version: string }>("/api/version");
  expect(version.version).toBe(workspaceVersion);

  const models = await getJson<{ models: Array<{ name: string; path: string }> }>(
    `/api/models?root=${encodeURIComponent(modelsRoot)}`,
  );
  expect(models.models.some((entry) => entry.path === modelDir)).toBe(true);

  const browse = await getJson<{
    entries: Array<{ name: string; path: string; isDir: boolean; isImage: boolean }>;
  }>(`/api/browse?path=${encodeURIComponent(smokeDir)}`);
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

  const thumbnail = await request(`/api/thumbnail?path=${encodeURIComponent(samplePathA)}`);
  expect(thumbnail.status).toBe(200);
  expect(thumbnail.headers.get("content-type")).toBe("image/gif");

  const previewAll = await postJson<CategorizeResult>("/api/categorize/preview", {
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

  const previewSelected = await postJson<CategorizeResult>("/api/categorize/preview", {
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

  const apply = await postJson<CategorizeResult>("/api/categorize/apply", {
    modelDir,
    targetDir: smokeDir,
    minConfidence: 0,
    moves: previewSelected.moves,
  });
  expect(apply.dry_run).toBe(false);
  expect(apply.failed).toHaveLength(0);
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

  const session = await getJson<{ hasLastOperation: boolean; moveCount: number }>("/api/session");
  expect(session).toEqual({ hasLastOperation: true, moveCount: 1 });

  const revert = await postJson<{ reverted: number }>("/api/revert");
  expect(revert).toEqual({ reverted: 1 });
  expect(await pathExists(samplePathA)).toBe(true);
  expect(await pathExists(samplePathB)).toBe(true);
  expect(await pathExists(appliedMove.to)).toBe(false);

  const clearedSession = await getJson<{ hasLastOperation: boolean; moveCount: number }>(
    "/api/session",
  );
  expect(clearedSession).toEqual({ hasLastOperation: false, moveCount: 0 });
});

test("web API rejects paths outside allowed roots", async () => {
  await writeFile(forbiddenPath, sampleGif);

  const browse = await request("/api/browse?path=%2Ftmp");
  expect(browse.status).toBe(403);

  const thumbnail = await request(`/api/thumbnail?path=${encodeURIComponent(forbiddenPath)}`);
  expect(thumbnail.status).toBe(403);
});

async function resetSmokeDir(): Promise<void> {
  await rm(smokeDir, { recursive: true, force: true });
  await mkdir(smokeDir, { recursive: true });
  await writeFile(samplePathA, sampleGif);
  await writeFile(samplePathB, sampleGif);
}

async function getJson<T>(pathname: string): Promise<T> {
  const response = await request(pathname);
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

async function postJson<T>(pathname: string, body?: unknown): Promise<T> {
  const response = await request(pathname, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
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
