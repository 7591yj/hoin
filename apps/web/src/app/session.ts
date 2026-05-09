import type { apiFetch } from "./api.ts";
import type { createProgressController } from "./progress.ts";

type ProgressController = ReturnType<typeof createProgressController>;

interface SessionOptions {
  apiFetch: typeof apiFetch;
  progress: ProgressController;
  revertBtn: HTMLButtonElement;
  summaryPanel: HTMLDivElement;
  setStatus: (message: string, loading?: boolean) => void;
  loadThumbnails: () => Promise<void>;
}

export function initSession(options: SessionOptions): { refreshSession: () => Promise<void> } {
  async function refreshSession(): Promise<void> {
    try {
      const { hasLastOperation } = await options.apiFetch<{ hasLastOperation: boolean }>(
        "/api/session",
      );
      options.revertBtn.style.display = hasLastOperation ? "block" : "none";
    } catch {
      // ignore
    }
  }

  options.revertBtn.addEventListener("click", async () => {
    if (!confirm("Revert the last categorize operation?")) return;
    options.setStatus("Reverting…", true);
    options.revertBtn.disabled = true;
    options.progress.start();
    try {
      const { reverted } = await options.apiFetch<{ reverted: number }>("/api/revert", {
        method: "POST",
      });
      options.summaryPanel.hidden = true;
      await refreshSession();
      await options.loadThumbnails();
      options.setStatus(`Reverted ${reverted} file(s).`);
    } catch (e) {
      options.setStatus(`Revert failed: ${(e as Error).message}`);
    } finally {
      options.revertBtn.disabled = false;
    }
  });

  return { refreshSession };
}
