import { dirname, basename, parentDir } from "./path-utils.ts";

//  Types
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

interface BrowseEntry {
  name: string;
  path: string;
  isDir: boolean;
  isImage: boolean;
}

interface ModelEntry {
  name: string;
  path: string;
}

interface CategorizeProgress {
  phase: "preview" | "apply";
  state: "idle" | "running" | "done" | "error";
  completed: number;
  total: number | null;
  message: string;
  startedAt: number | null;
  updatedAt: number | null;
}

const PICKER_ROOTS_VIEW = "__allowed_roots__";

//  State
let pendingPreview: CategorizeResult | null = null;
// Map from absolute file path → { class_key, confidence } after dry-run
let previewMap: Map<string, { class_key: string; confidence: number }> = new Map();
let allowedRoots: string[] = [];
let selectedFiles: Set<string> = new Set();
let progressPollTimer: number | null = null;

//  DOM refs
function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

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

//  Helpers
function setStatus(msg: string, loading = false): void {
  statusText.textContent = msg;
  statusBar.classList.toggle("loading", loading);
}

function renderBottomProgress(progress: CategorizeProgress | null): void {
  if (!progress || progress.state === "idle") {
    statusProgress.hidden = true;
    statusProgressLabel.textContent = "";
    statusProgressTrack.classList.remove("indeterminate");
    statusProgressTrack.setAttribute("aria-valuenow", "0");
    statusProgressFill.style.width = "0%";
    return;
  }

  statusProgress.hidden = false;
  const hasTotal = typeof progress.total === "number" && progress.total > 0;
  const percent = hasTotal ? Math.min(100, (progress.completed / progress.total) * 100) : 0;

  statusProgressLabel.textContent = hasTotal
    ? `${progress.phase === "preview" ? "Preview" : "Apply"} ${progress.completed}/${progress.total}`
    : progress.phase === "preview"
      ? "Preview in progress"
      : "Apply in progress";
  statusProgressTrack.classList.toggle("indeterminate", !hasTotal && progress.state === "running");
  statusProgressTrack.setAttribute("aria-valuenow", hasTotal ? String(Math.round(percent)) : "0");
  statusProgressFill.style.width = hasTotal ? `${percent}%` : "0%";
}

async function pollCategorizeProgress(stopWhenSettled = false): Promise<void> {
  try {
    const progress = await apiFetch<CategorizeProgress>("/api/categorize/progress");
    renderBottomProgress(progress);
    if (progress.state === "running") {
      setStatus(progress.message, true);
    }
    if (stopWhenSettled && (progress.state === "done" || progress.state === "error")) {
      stopProgressPolling();
    }
  } catch {
    // ignore polling failures
  }
}

function stopProgressPolling(): void {
  if (progressPollTimer !== null) {
    window.clearInterval(progressPollTimer);
    progressPollTimer = null;
  }
}

function startProgressPolling(): void {
  stopProgressPolling();
  void pollCategorizeProgress();
  progressPollTimer = window.setInterval(() => {
    void pollCategorizeProgress(true);
  }, 300);
}

function showError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.hidden = !msg;
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, opts);
  const json = (await res.json()) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

function activeModelDir(): string {
  return modelDirInput.value.trim() || modelSelect.value || "";
}

function setSelectedFiles(paths: Iterable<string>): void {
  selectedFiles = new Set(paths);
  updateActionButtons();
}

function selectedPreviewMoves(): MoveEntry[] {
  if (!pendingPreview) return [];
  return pendingPreview.moves.filter((move) => selectedFiles.has(move.from));
}

function updateActionButtons(): void {
  const selectedCount = selectedFiles.size;
  categorizeBtn.textContent =
    selectedCount === 0 ? "Categorize All" : `Categorize (${selectedCount})`;

  const applyCount = selectedPreviewMoves().length;
  confirmBtn.textContent = applyCount === 0 ? "Apply Selected" : `Apply Selected (${applyCount})`;
  confirmBtn.disabled = pendingPreview !== null && applyCount === 0;
}

//  Model scanning
scanModelsBtn.addEventListener("click", async () => {
  const root = modelsRootInput.value.trim();
  if (!root) {
    showError(modelError, "Enter a models root directory first.");
    return;
  }
  showError(modelError, "");
  setStatus("Scanning for models…", true);
  try {
    const { models } = await apiFetch<{ models: ModelEntry[] }>(
      `/api/models?root=${encodeURIComponent(root)}`,
    );
    while (modelSelect.options.length > 1) modelSelect.remove(1);
    if (models.length === 0) {
      showError(modelError, "No models found in that directory.");
    } else {
      for (const m of models) {
        const opt = new Option(m.name, m.path);
        modelSelect.add(opt);
      }
      modelSelect.selectedIndex = 1;
      setStatus(`Found ${models.length} model(s).`);
    }
  } catch (e) {
    showError(modelError, (e as Error).message);
    setStatus("Error scanning models.");
  }
});

//  Thumbnails
targetDirInput.addEventListener("change", loadThumbnails);

async function loadThumbnails(): Promise<void> {
  const dir = targetDirInput.value.trim();
  if (!dir) {
    setSelectedFiles([]);
    thumbnailsEl.innerHTML = '<p class="empty-state">Select a target directory to see files.</p>';
    return;
  }
  showError(targetError, "");
  setStatus("Loading files…", true);
  try {
    const { entries } = await apiFetch<{ entries: BrowseEntry[] }>(
      `/api/browse?path=${encodeURIComponent(dir)}&recursive=1`,
    );
    const images = entries.filter((e) => e.isImage);
    const visiblePaths = new Set(images.map((entry) => entry.path));
    setSelectedFiles([...selectedFiles].filter((file) => visiblePaths.has(file)));
    if (images.length === 0) {
      thumbnailsEl.innerHTML = '<p class="empty-state">No images found in this directory.</p>';
    } else {
      thumbnailsEl.innerHTML = "";
      for (const entry of images) {
        const preview = previewMap.get(entry.path);
        if (pendingPreview && !preview) continue;
        const thumb = document.createElement("button");
        thumb.type = "button";
        thumb.className = "thumb";
        if (preview) thumb.classList.add("thumb--predicted");
        if (selectedFiles.has(entry.path)) thumb.classList.add("thumb--selected");
        thumb.dataset.path = entry.path;
        thumb.innerHTML = `
          <img src="/api/thumbnail?path=${encodeURIComponent(entry.path)}" loading="lazy" alt="${entry.name}" />
          ${
            preview
              ? `<div class="thumb-label">${preview.class_key.replace(/_/g, " ")}<span class="thumb-conf">${(preview.confidence * 100).toFixed(0)}%</span></div>`
              : ""
          }
          <div class="thumb-name">${entry.name}</div>
        `;
        thumb.addEventListener("click", () => {
          const next = new Set(selectedFiles);
          if (next.has(entry.path)) {
            next.delete(entry.path);
            thumb.classList.remove("thumb--selected");
          } else {
            next.add(entry.path);
            thumb.classList.add("thumb--selected");
          }
          setSelectedFiles(next);
          if (pendingPreview) updatePreviewPanel();
        });
        thumbnailsEl.appendChild(thumb);
      }
    }
    setStatus(`${images.length} image(s) found.`);
  } catch (e) {
    showError(targetError, (e as Error).message);
    thumbnailsEl.innerHTML = "";
    setStatus("Failed to load files.");
  }
}

//  Categorize
categorizeBtn.addEventListener("click", async () => {
  showError(modelError, "");
  showError(targetError, "");

  const modelDir = activeModelDir();
  const targetDir = targetDirInput.value.trim();
  if (!modelDir) {
    showError(modelError, "Select or enter a model directory.");
    return;
  }
  if (!targetDir) {
    showError(targetError, "Enter a target directory.");
    return;
  }

  previewPanel.hidden = true;
  summaryPanel.hidden = true;
  pendingPreview = null;
  previewMap = new Map();
  updateActionButtons();
  setStatus("Running dry-run…", true);
  renderBottomProgress({
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
  startProgressPolling();
  categorizeBtn.disabled = true;

  try {
    const result = await apiFetch<CategorizeResult>("/api/categorize/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelDir,
        targetDir,
        ja: jaToggle.checked,
        minConfidence: parseFloat(minConfInput.value),
        selectedFiles: [...selectedFiles],
      }),
    });
    pendingPreview = result;
    previewMap = new Map(
      result.moves.map((m) => [m.from, { class_key: m.class_key, confidence: m.confidence }]),
    );
    setSelectedFiles(result.moves.map((move) => move.from));
    updatePreviewPanel();
    await loadThumbnails();
    previewPanel.hidden = false;
    setStatus("Review planned moves and confirm.");
  } catch (e) {
    setStatus(`Error: ${(e as Error).message}`);
  } finally {
    await pollCategorizeProgress(true);
    categorizeBtn.disabled = false;
  }
});

//  Tree
function renderTree(moves: MoveEntry[]): void {
  const tree: Record<string, MoveEntry[]> = {};
  for (const move of moves) {
    const dir = dirname(move.to);
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push(move);
  }

  const dirs = Object.keys(tree).sort();
  if (dirs.length === 0) {
    treeRoot.innerHTML = '<span style="color:var(--muted)">No moves planned.</span>';
    return;
  }

  treeRoot.innerHTML = dirs
    .map((dir) => {
      const files = tree[dir];
      const filesHtml = files
        .map((m) => {
          const name = basename(m.from);
          return `<div class="tree-file"><span>${name}</span><span class="conf">${(m.confidence * 100).toFixed(0)}%</span></div>`;
        })
        .join("");
      return `
      <div class="tree-dir" data-tree-dir>${dir}</div>
      <div class="tree-files">${filesHtml}</div>
    `;
    })
    .join("");

  treeRoot.querySelectorAll<HTMLElement>("[data-tree-dir]").forEach((dirEl) => {
    dirEl.addEventListener("click", () => {
      dirEl.classList.toggle("open");
      (dirEl.nextElementSibling as HTMLElement).classList.toggle("visible");
    });
  });
}

function updatePreviewPanel(): void {
  if (!pendingPreview) return;
  const moves = selectedPreviewMoves();
  renderTree(moves);
  previewCount.textContent = `${moves.length} file(s) selected to move`;
  updateActionButtons();
}

//  Confirm / Cancel
confirmBtn.addEventListener("click", async () => {
  if (!pendingPreview) return;
  const modelDir = activeModelDir();
  const targetDir = targetDirInput.value.trim();

  previewPanel.hidden = true;
  setStatus("Applying…", true);
  renderBottomProgress({
    phase: "apply",
    state: "running",
    completed: 0,
    total: selectedPreviewMoves().length,
    message: `Applying 0/${selectedPreviewMoves().length} move(s)…`,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
  startProgressPolling();
  confirmBtn.disabled = true;

  try {
    const result = await apiFetch<CategorizeResult>("/api/categorize/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelDir,
        targetDir,
        ja: jaToggle.checked,
        minConfidence: parseFloat(minConfInput.value),
        moves: selectedPreviewMoves(),
      }),
    });
    pendingPreview = null;
    previewMap = new Map();
    renderSummary(result.summary);
    summaryPanel.hidden = false;
    await refreshSession();
    await loadThumbnails();
    setStatus("Done.");
  } catch (e) {
    setStatus(`Error: ${(e as Error).message}`);
    previewPanel.hidden = false;
  } finally {
    await pollCategorizeProgress(true);
    confirmBtn.disabled = false;
  }
});

cancelBtn.addEventListener("click", () => {
  previewPanel.hidden = true;
  pendingPreview = null;
  previewMap = new Map();
  updateActionButtons();
  loadThumbnails();
  setStatus("Cancelled.");
});

//  Summary
function renderSummary(s: CategorizeResult["summary"]): void {
  const items: [string, number][] = [
    ["Scanned", s.scanned],
    ["Moved", s.moves],
    ["Others", s.routed_to_others],
    ["Low conf.", s.low_confidence_skipped],
    ["Already done", s.already_categorized],
    ["Failed", s.failed],
  ];
  summaryGrid.innerHTML = items
    .map(
      ([label, val]) => `
    <div class="summary-item"><strong>${val}</strong>${label}</div>
  `,
    )
    .join("");
}

//  Revert
revertBtn.addEventListener("click", async () => {
  if (!confirm("Revert the last categorize operation?")) return;
  setStatus("Reverting…", true);
  revertBtn.disabled = true;
  try {
    const { reverted } = await apiFetch<{ reverted: number }>("/api/revert", {
      method: "POST",
    });
    summaryPanel.hidden = true;
    await refreshSession();
    await loadThumbnails();
    setStatus(`Reverted ${reverted} file(s).`);
  } catch (e) {
    setStatus(`Revert failed: ${(e as Error).message}`);
  } finally {
    revertBtn.disabled = false;
  }
});

//  Session
async function refreshSession(): Promise<void> {
  try {
    const { hasLastOperation } = await apiFetch<{ hasLastOperation: boolean }>("/api/session");
    revertBtn.style.display = hasLastOperation ? "block" : "none";
  } catch {
    // ignore
  }
}

refreshSession();
void pollCategorizeProgress(true);

let serverCwd = "/";

apiFetch<{ version: string; cwd: string; allowedRoots: string[] }>("/api/version")
  .then(({ version, cwd, allowedRoots: roots }) => {
    const badge = el<HTMLElement>("version-badge");
    badge.textContent = `v${version}`;
    serverCwd = cwd;
    allowedRoots = roots;
  })
  .catch(() => {});

//  Directory picker
const pickerOverlay = el<HTMLDivElement>("dir-picker-overlay");
const pickerCwd = el<HTMLSpanElement>("dir-picker-cwd");
const pickerList = el<HTMLUListElement>("dir-picker-list");
const pickerUpBtn = el<HTMLButtonElement>("dir-picker-up");
const pickerSelectBtn = el<HTMLButtonElement>("dir-picker-select");
const pickerCancelBtn = el<HTMLButtonElement>("dir-picker-cancel");

let pickerTargetInput: HTMLInputElement | null = null;
let pickerCurrentDir = PICKER_ROOTS_VIEW;
let pickerSelectedDir: string | null = null;

function isWithinAllowedRoot(dir: string): boolean {
  return allowedRoots.some(
    (root) => dir === root || dir.startsWith(`${root}/`) || dir.startsWith(`${root}\\`),
  );
}

function renderAllowedRoots(): void {
  pickerCurrentDir = PICKER_ROOTS_VIEW;
  pickerSelectedDir = null;
  pickerCwd.textContent = "Allowed locations";
  pickerList.innerHTML = "";

  for (const root of allowedRoots) {
    const li = document.createElement("li");
    li.textContent = root;
    li.dataset.path = root;
    li.addEventListener("click", () => {
      pickerList.querySelectorAll("li").forEach((el) => {
        el.classList.remove("selected");
      });
      li.classList.add("selected");
      pickerSelectedDir = root;
    });
    li.addEventListener("dblclick", () => pickerNavigate(root));
    pickerList.appendChild(li);
  }
}

async function openPicker(targetInput: HTMLInputElement): Promise<void> {
  pickerTargetInput = targetInput;
  pickerSelectedDir = null;
  const startDir = targetInput.value.trim() || serverCwd;
  if (isWithinAllowedRoot(startDir)) {
    await pickerNavigate(startDir);
  } else {
    renderAllowedRoots();
  }
  pickerOverlay.hidden = false;
}

async function pickerNavigate(dir: string): Promise<void> {
  if (!isWithinAllowedRoot(dir)) {
    renderAllowedRoots();
    return;
  }

  pickerCurrentDir = dir;
  pickerSelectedDir = null;
  pickerCwd.textContent = dir;
  pickerList.innerHTML = "";

  try {
    const { entries } = await apiFetch<{ entries: BrowseEntry[] }>(
      `/api/browse?path=${encodeURIComponent(dir)}`,
    );
    const dirs = entries.filter((e) => e.isDir);
    if (dirs.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No subdirectories";
      li.style.color = "var(--muted)";
      li.style.cursor = "default";
      pickerList.appendChild(li);
    } else {
      for (const d of dirs) {
        const li = document.createElement("li");
        li.textContent = d.name;
        li.dataset.path = d.path;
        li.addEventListener("click", () => {
          pickerList.querySelectorAll("li").forEach((el) => {
            el.classList.remove("selected");
          });
          li.classList.add("selected");
          pickerSelectedDir = d.path;
        });
        li.addEventListener("dblclick", () => pickerNavigate(d.path));
        pickerList.appendChild(li);
      }
    }
  } catch {
    pickerCwd.textContent = `${dir} (error reading directory)`;
  }
}

pickerUpBtn.addEventListener("click", () => {
  if (pickerCurrentDir === PICKER_ROOTS_VIEW) return;

  const parent = parentDir(pickerCurrentDir);
  if (allowedRoots.includes(pickerCurrentDir) || !isWithinAllowedRoot(parent)) {
    renderAllowedRoots();
    return;
  }

  pickerNavigate(parent);
});

pickerSelectBtn.addEventListener("click", () => {
  if (pickerTargetInput) {
    pickerTargetInput.value = pickerSelectedDir ?? pickerCurrentDir;
    pickerTargetInput.dispatchEvent(new Event("change"));
  }
  pickerOverlay.hidden = true;
});

pickerCancelBtn.addEventListener("click", () => {
  pickerOverlay.hidden = true;
});

pickerOverlay.addEventListener("click", (e) => {
  if (e.target === pickerOverlay) pickerOverlay.hidden = true;
});

document.querySelectorAll<HTMLButtonElement>(".icon-btn[data-pick]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.pick;
    if (!targetId) return;
    const input = el<HTMLInputElement>(targetId);
    openPicker(input);
  });
});

updateActionButtons();
