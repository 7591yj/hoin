import { constants } from "node:fs";
import { copyFile, open, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";

export async function moveFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    if (!isCrossDeviceError(error)) throw error;
    await copyThenUnlink(source, destination);
  }
}

function isCrossDeviceError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "EXDEV"
  );
}

async function copyThenUnlink(source: string, destination: string): Promise<void> {
  let copied = false;
  try {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    copied = true;
    await syncFile(destination);
    await syncDirectory(path.dirname(destination));
    await unlink(source);
  } catch (error) {
    if (copied) await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function syncFile(filePath: string): Promise<void> {
  const file = await open(filePath, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const file = await open(directory, "r");
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  } catch {
    // Directory fsync is not supported on all platforms/filesystems.
  }
}
