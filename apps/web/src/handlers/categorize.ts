import { runCategorize } from "../cli.ts";
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

  const output = await runCategorize({ ...validated, dryRun: true });
  return jsonResponse(200, output);
}

export async function handleCategorizeApply(req: Request, _url: URL): Promise<Response> {
  const body = await parseBody(req);
  const validated = validateBody(body);
  if ("error" in validated) return jsonResponse(400, validated);

  const output = await runCategorize({ ...validated, dryRun: false });

  session.lastOperation = {
    moves: output.moves,
    timestamp: Date.now(),
  };

  return jsonResponse(200, output);
}
