import type { CategorizeProgressEvent } from "../types/categorize.ts";

export async function readStderr(
  stderr: ReadableStream<Uint8Array>,
  onProgress?: (event: CategorizeProgressEvent) => void,
): Promise<string> {
  if (!onProgress) return new Response(stderr).text();

  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  let stderrText = "";
  let bufferedLine = "";

  const handleLine = (line: string): void => {
    if (!emitProgressEvent(line, onProgress)) stderrText += `${line}\n`;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    bufferedLine += decoder.decode(value, { stream: true });

    const lines = bufferedLine.split(/\r?\n/);
    bufferedLine = lines.pop() ?? "";
    for (const line of lines) {
      handleLine(line);
    }
  }

  bufferedLine += decoder.decode();
  if (bufferedLine) handleLine(bufferedLine);

  return stderrText;
}

function emitProgressEvent(
  line: string,
  onProgress: (event: CategorizeProgressEvent) => void,
): boolean {
  try {
    const event = JSON.parse(line) as Partial<CategorizeProgressEvent>;
    if (
      (event.event === "file_done" || event.event === "move_done") &&
      typeof event.completed === "number" &&
      typeof event.total === "number" &&
      typeof event.file === "string"
    ) {
      onProgress({
        event: event.event,
        completed: event.completed,
        total: event.total,
        file: event.file,
      });
      return true;
    }
  } catch {
    // Keep non-JSON stderr for error reporting.
  }
  return false;
}
