import { expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { moveFile } from "./file-move.ts";

test("moveFile places file in destination", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hoin-move-"));
  try {
    const source = path.join(temp, "input.txt");
    const destination = path.join(temp, "nested", "input.txt");
    await writeFile(source, "contents");
    await mkdir(path.dirname(destination), { recursive: true });

    await moveFile(source, destination);

    await expect(access(source)).rejects.toThrow();
    expect(await readFile(destination, "utf8")).toBe("contents");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
