import { rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";

export async function handleRevert(_req: Request, _url: URL): Promise<Response> {
  if (!session.lastOperation) {
    return jsonResponse(400, { error: "no operation to revert" });
  }

  const { moves } = session.lastOperation;
  let reverted = 0;

  for (const move of [...moves].reverse()) {
    const destDir = path.dirname(move.from);
    try {
      await mkdir(destDir, { recursive: true });
      await rename(move.to, move.from);
      reverted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse(500, { error: `failed to revert ${move.to}: ${message}`, reverted });
    }
  }

  session.lastOperation = null;
  return jsonResponse(200, { reverted });
}
