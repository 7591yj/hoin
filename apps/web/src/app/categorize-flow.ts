import { renderMoveTree } from "./preview-tree.ts";
import type { ApplyJsonOutput, CategorizeResult, MoveEntry } from "../types/categorize.ts";
import type { apiFetch } from "./api.ts";
import type { createProgressController } from "./progress.ts";
import { renderApplySummary } from "./summary.ts";

type PreviewMap = Map<string, { class_key: string; confidence: number }>;
type ProgressController = ReturnType<typeof createProgressController>;

interface CategorizeFlowOptions {
  apiFetch: typeof apiFetch;
  progress: ProgressController;
  categorizeBtn: HTMLButtonElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  modelError: HTMLElement;
  targetError: HTMLElement;
  targetDirInput: HTMLInputElement;
  jaToggle: HTMLInputElement;
  minConfInput: HTMLInputElement;
  previewPanel: HTMLDivElement;
  previewCount: HTMLSpanElement;
  treeRoot: HTMLDivElement;
  summaryPanel: HTMLDivElement;
  summaryGrid: HTMLDivElement;
  activeModelDir: () => string;
  getSelectedFiles: () => Set<string>;
  setSelectedFiles: (paths: Iterable<string>) => void;
  getPendingPreview: () => CategorizeResult | null;
  setPendingPreview: (preview: CategorizeResult | null) => void;
  setPreviewMap: (previewMap: PreviewMap) => void;
  showError: (element: HTMLElement, message: string) => void;
  setStatus: (message: string, loading?: boolean) => void;
  loadThumbnails: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

function parseMinConfidence(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

export function initCategorizeFlow(options: CategorizeFlowOptions): {
  selectedPreviewMoves: () => MoveEntry[];
  updatePreviewPanel: () => void;
  updateActionButtons: () => void;
} {
  function selectedPreviewMoves(): MoveEntry[] {
    const pendingPreview = options.getPendingPreview();
    if (!pendingPreview) return [];
    const selectedFiles = options.getSelectedFiles();
    return pendingPreview.moves.filter((move) => selectedFiles.has(move.from));
  }

  function updateActionButtons(): void {
    const selectedCount = options.getSelectedFiles().size;
    options.categorizeBtn.textContent =
      selectedCount === 0 ? "Categorize All" : `Categorize (${selectedCount})`;

    const applyCount = selectedPreviewMoves().length;
    options.confirmBtn.textContent =
      applyCount === 0 ? "Apply Selected" : `Apply Selected (${applyCount})`;
    options.confirmBtn.disabled = options.getPendingPreview() !== null && applyCount === 0;
  }

  function updatePreviewPanel(): void {
    if (!options.getPendingPreview()) return;
    const moves = selectedPreviewMoves();
    renderMoveTree(options.treeRoot, moves);
    options.previewCount.textContent = `${moves.length} file(s) selected to move`;
    updateActionButtons();
  }

  options.categorizeBtn.addEventListener("click", async () => {
    options.showError(options.modelError, "");
    options.showError(options.targetError, "");

    const modelDir = options.activeModelDir();
    const targetDir = options.targetDirInput.value.trim();
    const minConfidence = parseMinConfidence(options.minConfInput.value);
    if (!modelDir) {
      options.showError(options.modelError, "Select or enter a model directory.");
      return;
    }
    if (!targetDir) {
      options.showError(options.targetError, "Enter a target directory.");
      return;
    }
    if (minConfidence === null) {
      options.showError(
        options.targetError,
        "Minimum confidence must be a number between 0 and 1.",
      );
      return;
    }

    options.previewPanel.hidden = true;
    options.summaryPanel.hidden = true;
    options.setPendingPreview(null);
    options.setPreviewMap(new Map());
    updateActionButtons();
    options.setStatus("Running dry-run…", true);
    const selectedFiles = options.getSelectedFiles();
    options.progress.render({
      phase: "preview",
      state: "running",
      completed: 0,
      total: selectedFiles.size > 0 ? selectedFiles.size : null,
      message:
        selectedFiles.size > 0
          ? `Categorizing ${selectedFiles.size} selected image(s)…`
          : "Categorizing images…",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    options.progress.start();
    options.categorizeBtn.disabled = true;

    try {
      const result = await options.apiFetch<CategorizeResult>("/api/categorize/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelDir,
          targetDir,
          ja: options.jaToggle.checked,
          minConfidence,
          selectedFiles: [...selectedFiles],
        }),
      });
      options.setPendingPreview(result);
      options.setPreviewMap(
        new Map(
          result.moves.map((m) => [m.from, { class_key: m.class_key, confidence: m.confidence }]),
        ),
      );
      options.setSelectedFiles(result.moves.map((move) => move.from));
      updatePreviewPanel();
      await options.loadThumbnails();
      options.previewPanel.hidden = false;
      options.setStatus("Review planned moves and confirm.");
    } catch (e) {
      options.setStatus(`Error: ${(e as Error).message}`);
    } finally {
      await options.progress.poll(true);
      options.categorizeBtn.disabled = false;
    }
  });

  options.confirmBtn.addEventListener("click", async () => {
    if (!options.getPendingPreview()) return;
    const modelDir = options.activeModelDir();
    const targetDir = options.targetDirInput.value.trim();
    const minConfidence = parseMinConfidence(options.minConfInput.value);
    if (minConfidence === null) {
      options.showError(
        options.targetError,
        "Minimum confidence must be a number between 0 and 1.",
      );
      options.previewPanel.hidden = false;
      return;
    }
    const moves = selectedPreviewMoves();

    options.previewPanel.hidden = true;
    options.setStatus("Applying…", true);
    options.progress.render({
      phase: "apply",
      state: "running",
      completed: 0,
      total: moves.length,
      message: `Applying 0/${moves.length} move(s)…`,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    options.progress.start();
    options.confirmBtn.disabled = true;

    try {
      const result = await options.apiFetch<ApplyJsonOutput>("/api/categorize/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelDir,
          targetDir,
          ja: options.jaToggle.checked,
          minConfidence,
          moves,
        }),
      });
      options.setPendingPreview(null);
      options.setPreviewMap(new Map());
      renderApplySummary(options.summaryGrid, result.summary);
      options.summaryPanel.hidden = false;
      await options.refreshSession();
      await options.loadThumbnails();
      options.setStatus("Done.");
    } catch (e) {
      options.setStatus(`Error: ${(e as Error).message}`);
      options.previewPanel.hidden = false;
    } finally {
      await options.progress.poll(true);
      options.confirmBtn.disabled = false;
    }
  });

  options.cancelBtn.addEventListener("click", () => {
    options.previewPanel.hidden = true;
    options.setPendingPreview(null);
    options.setPreviewMap(new Map());
    updateActionButtons();
    void options.loadThumbnails();
    options.setStatus("Cancelled.");
  });

  return { selectedPreviewMoves, updatePreviewPanel, updateActionButtons };
}
