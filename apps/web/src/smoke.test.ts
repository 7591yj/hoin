import { afterAll, beforeAll, expect, test } from "bun:test";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { handleRequest } from "./web.ts";

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
const smokeDir = "/tmp/hoin-smoke";
const sampleName = "sample.gif";
const samplePath = path.join(smokeDir, sampleName);
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

  const models = await getJson<{ models: Array<{ name: string; path: string }> }>(
    `/api/models?root=${encodeURIComponent(modelsRoot)}`,
  );
  expect(models.models.some((entry) => entry.path === modelDir)).toBe(true);

  const browse = await getJson<{
    entries: Array<{ name: string; path: string; isDir: boolean; isImage: boolean }>;
  }>(`/api/browse?path=${encodeURIComponent(smokeDir)}`);
  expect(browse.entries).toContainEqual({
    name: sampleName,
    path: samplePath,
    isDir: false,
    isImage: true,
  });

  const thumbnail = await request(`/api/thumbnail?path=${encodeURIComponent(samplePath)}`);
  expect(thumbnail.status).toBe(200);
  expect(thumbnail.headers.get("content-type")).toBe("image/gif");

  const preview = await postJson<CategorizeResult>("/api/categorize/preview", {
    modelDir,
    targetDir: smokeDir,
    minConfidence: 0,
  });
  expect(preview.dry_run).toBe(true);
  expect(preview.failed).toHaveLength(0);
  expect(preview.summary.scanned).toBe(1);
  expect(preview.moves).toHaveLength(1);
  expect(preview.moves[0]?.from).toBe(samplePath);
  expect(await pathExists(samplePath)).toBe(true);

  const apply = await postJson<CategorizeResult>("/api/categorize/apply", {
    modelDir,
    targetDir: smokeDir,
    minConfidence: 0,
  });
  expect(apply.dry_run).toBe(false);
  expect(apply.failed).toHaveLength(0);
  expect(apply.moves).toHaveLength(1);
  expect(apply.moves[0]?.from).toBe(samplePath);
  expect(apply.moves[0]?.to).toBe(preview.moves[0]?.to);
  expect(await pathExists(samplePath)).toBe(false);
  expect(await pathExists(apply.moves[0]!.to)).toBe(true);

  const session = await getJson<{ hasLastOperation: boolean; moveCount: number }>("/api/session");
  expect(session).toEqual({ hasLastOperation: true, moveCount: 1 });

  const revert = await postJson<{ reverted: number }>("/api/revert");
  expect(revert).toEqual({ reverted: 1 });
  expect(await pathExists(samplePath)).toBe(true);
  expect(await pathExists(apply.moves[0]!.to)).toBe(false);

  const clearedSession = await getJson<{ hasLastOperation: boolean; moveCount: number }>(
    "/api/session",
  );
  expect(clearedSession).toEqual({ hasLastOperation: false, moveCount: 0 });
});

async function resetSmokeDir(): Promise<void> {
  await rm(smokeDir, { recursive: true, force: true });
  await mkdir(smokeDir, { recursive: true });
  await writeFile(samplePath, sampleGif);
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
