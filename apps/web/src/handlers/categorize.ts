import { runCategorize } from "../cli.ts";
import { resolveAllowedPath } from "../allowed-paths.ts";
import { session } from "../session.ts";
import { jsonResponse } from "../router.ts";

interface CategorizeBody {
  modelDir?: unknown;
  targetDir?: unknown;
  ja?: unknown;
  minConfidence?: unknown;
}

async function parseBody(req: Request): Promise<CategorizeBody> {
  try {
    return (await req.json()) as CategorizeBody;
  } catch {
    return {};
  }
}

function validateBody(
  body: CategorizeBody,
): { modelDir: string; targetDir: string; ja: boolean; minConfidence: number } | { error: string } {
  if (typeof body.modelDir !== "string" || !body.modelDir) return { error: "modelDir required" };
  if (typeof body.targetDir !== "string" || !body.targetDir) return { error: "targetDir required" };
  return {
    modelDir: body.modelDir,
    targetDir: body.targetDir,
    ja: body.ja === true,
    minConfidence: typeof body.minConfidence === "number" ? body.minConfidence : 0.3,
  };
}

export async function handleCategorizePreview(req: Request, _url: URL): Promise<Response> {
  const body = await parseBody(req);
  const validated = validateBody(body);
  if ("error" in validated) return jsonResponse(400, validated);

  try {
    const modelDir = await resolveAllowedPath(validated.modelDir);
    const targetDir = await resolveAllowedPath(validated.targetDir);
    const output = await runCategorize({ ...validated, modelDir, targetDir, dryRun: true });
    return jsonResponse(200, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("outside allowed roots") ? 403 : 400;
    return jsonResponse(status, { error: message });
  }
}

export async function handleCategorizeApply(req: Request, _url: URL): Promise<Response> {
  const body = await parseBody(req);
  const validated = validateBody(body);
  if ("error" in validated) return jsonResponse(400, validated);

  try {
    const modelDir = await resolveAllowedPath(validated.modelDir);
    const targetDir = await resolveAllowedPath(validated.targetDir);
    const output = await runCategorize({ ...validated, modelDir, targetDir, dryRun: false });

    session.lastOperation = {
      moves: output.moves,
      timestamp: Date.now(),
    };

    return jsonResponse(200, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("outside allowed roots") ? 403 : 400;
    return jsonResponse(status, { error: message });
  }
}
