import { apiFetch } from "./app/api.ts";
import { el } from "./app/dom.ts";
import { activeModelDir as selectedModelDir, initModelScanner } from "./app/models.ts";
import { createProgressController } from "./app/progress.ts";
import { initCategorizeFlow } from "./app/categorize-flow.ts";
import { initSession } from "./app/session.ts";
import { createThumbnailLoader } from "./app/thumbnails.ts";
import { initDirectoryPicker } from "./app/directory-picker.ts";
import { initKeyboardShortcuts } from "./app/keyboard-binds.ts";
import type { CategorizeResult } from "./types/categorize.ts";

let pendingPreview: CategorizeResult | null = null;
let previewMap: Map<string, { class_key: string; confidence: number }> = new Map();
let allowedRoots: string[] = [];
let selectedFiles: Set<string> = new Set();

const modelsRootInput = el<HTMLInputElement>("models-root");
const scanModelsBtn = el<HTMLButtonElement>("scan-models-btn");
const modelSelect = el<HTMLSelectElement>("model-select");
const modelDirInput = el<HTMLInputElement>("model-dir-input");
const modelError = el<HTMLElement>("model-error");
const targetDirInput = el<HTMLInputElement>("target-dir");
const targetError = el<HTMLElement>("target-error");
const minConfInput = el<HTMLInputElement>("min-confidence");
const jaToggle = el<HTMLInputElement>("ja-toggle");

const categorizeBtn = el<HTMLButtonElement>("categorize-btn");
const revertBtn = el<HTMLButtonElement>("revert-btn");
const confirmBtn = el<HTMLButtonElement>("confirm-btn");
const cancelBtn = el<HTMLButtonElement>("cancel-btn");
const shortcutsHelpBtn = el<HTMLButtonElement>("shortcuts-help-btn");

const thumbnailsEl = el<HTMLDivElement>("thumbnails");
const previewPanel = el<HTMLDivElement>("preview-panel");
const previewCount = el<HTMLSpanElement>("preview-count");
const treeRoot = el<HTMLDivElement>("tree-root");
const summaryPanel = el<HTMLDivElement>("summary-panel");
const summaryGrid = el<HTMLDivElement>("summary-grid");
const statusBar = el<HTMLDivElement>("statusbar");
const statusText = el<HTMLSpanElement>("status-text");
const statusProgress = el<HTMLDivElement>("status-progress");
const statusProgressLabel = el<HTMLSpanElement>("status-progress-label");
const statusProgressTrack = el<HTMLDivElement>("status-progress-track");
const statusProgressFill = el<HTMLDivElement>("status-progress-fill");

function setStatus(msg: string, loading = false): void {
  statusText.textContent = msg;
  statusBar.classList.toggle("loading", loading);
}

const progress = createProgressController({
  apiFetch,
  setStatus,
  statusProgress,
  statusProgressLabel,
  statusProgressTrack,
  statusProgressFill,
});

function showError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.hidden = !msg;
}

function activeModelDir(): string {
  return selectedModelDir(modelDirInput, modelSelect);
}

let updateActionButtons = (): void => {};
let updatePreviewPanel = (): void => {};

function setSelectedFiles(paths: Iterable<string>): void {
  selectedFiles = new Set(paths);
  updateActionButtons();
}

scanModelsBtn.addEventListener("click", () => {
  initModelScanner({
    apiFetch,
    modelsRootInput,
    modelSelect,
    modelError,
    showError,
    setStatus,
  });
});

const loadThumbnails = createThumbnailLoader({
  apiFetch,
  targetDirInput,
  targetError,
  thumbnailsEl,
  getSelectedFiles: () => selectedFiles,
  setSelectedFiles,
  getPendingPreview: () => pendingPreview,
  getPreviewMap: () => previewMap,
  updatePreviewPanel,
  showError,
  setStatus,
});

targetDirInput.addEventListener("change", loadThumbnails);

const session = initSession({
  apiFetch,
  progress,
  revertBtn,
  summaryPanel,
  setStatus,
  loadThumbnails,
});

const categorizeFlow = initCategorizeFlow({
  apiFetch,
  progress,
  categorizeBtn,
  confirmBtn,
  cancelBtn,
  modelError,
  targetError,
  targetDirInput,
  jaToggle,
  minConfInput,
  previewPanel,
  previewCount,
  treeRoot,
  summaryPanel,
  summaryGrid,
  activeModelDir,
  getSelectedFiles: () => selectedFiles,
  setSelectedFiles,
  getPendingPreview: () => pendingPreview,
  setPendingPreview: (preview) => {
    pendingPreview = preview;
  },
  setPreviewMap: (nextPreviewMap) => {
    previewMap = nextPreviewMap;
  },
  showError,
  setStatus,
  loadThumbnails,
  refreshSession: session.refreshSession,
});

updateActionButtons = categorizeFlow.updateActionButtons;
updatePreviewPanel = categorizeFlow.updatePreviewPanel;

void session.refreshSession();
void progress.poll(true);

let serverCwd = "/";

apiFetch<{ version: string; cwd: string; allowedRoots: string[] }>("/api/version")
  .then(({ version, cwd, allowedRoots: roots }) => {
    const badge = el<HTMLElement>("version-badge");
    badge.textContent = `v${version}`;
    serverCwd = cwd;
    allowedRoots = roots;
  })
  .catch((e) => {
    setStatus(`Failed to load app metadata: ${(e as Error).message}`);
  });

initDirectoryPicker({
  el,
  apiFetch,
  getAllowedRoots: () => allowedRoots,
  getServerCwd: () => serverCwd,
});

const _disposeKeyboardShortcuts = initKeyboardShortcuts({
  helpButton: shortcutsHelpBtn,
  categorizeBtn,
  confirmBtn,
  cancelBtn,
  previewPanel,
  getSelectedFiles: () => selectedFiles,
  setSelectedFiles,
  getPendingPreview: () => pendingPreview,
  updatePreviewPanel,
  setStatus,
});

updateActionButtons();
