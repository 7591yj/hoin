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

//  State
let pendingPreview: CategorizeResult | null = null;

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

//  Helpers
function setStatus(msg: string, loading = false): void {
  statusText.textContent = msg;
  statusBar.classList.toggle("loading", loading);
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
    thumbnailsEl.innerHTML =
      '<p class="empty-state">Select a target directory to see files.</p>';
    return;
  }
  showError(targetError, "");
  setStatus("Loading files…", true);
  try {
    const { entries } = await apiFetch<{ entries: BrowseEntry[] }>(
      `/api/browse?path=${encodeURIComponent(dir)}`,
    );
    const images = entries.filter((e) => e.isImage);
    if (images.length === 0) {
      thumbnailsEl.innerHTML =
        '<p class="empty-state">No images found in this directory.</p>';
    } else {
      thumbnailsEl.innerHTML = images
        .map(
          (e) => `
        <div class="thumb">
          <img src="/api/thumbnail?path=${encodeURIComponent(e.path)}" loading="lazy" alt="${e.name}" />
          <div class="thumb-name">${e.name}</div>
        </div>
      `,
        )
        .join("");
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
  setStatus("Running dry-run…", true);
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
      }),
    });
    pendingPreview = result;
    renderTree(result);
    previewPanel.hidden = false;
    previewCount.textContent = `${result.moves.length} file(s)`;
    setStatus("Review planned moves and confirm.");
  } catch (e) {
    setStatus(`Error: ${(e as Error).message}`);
  } finally {
    categorizeBtn.disabled = false;
  }
});

//  Tree
function renderTree(result: CategorizeResult): void {
  const tree: Record<string, MoveEntry[]> = {};
  for (const move of result.moves) {
    const dir = move.to.substring(0, move.to.lastIndexOf("/"));
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push(move);
  }

  const dirs = Object.keys(tree).sort();
  if (dirs.length === 0) {
    treeRoot.innerHTML =
      '<span style="color:var(--muted)">No moves planned.</span>';
    return;
  }

  treeRoot.innerHTML = dirs
    .map((dir) => {
      const files = tree[dir];
      const filesHtml = files
        .map((m) => {
          const name = m.from.substring(m.from.lastIndexOf("/") + 1);
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

//  Confirm / Cancel
confirmBtn.addEventListener("click", async () => {
  if (!pendingPreview) return;
  const modelDir = activeModelDir();
  const targetDir = targetDirInput.value.trim();

  previewPanel.hidden = true;
  setStatus("Applying…", true);
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
      }),
    });
    renderSummary(result.summary);
    summaryPanel.hidden = false;
    await refreshSession();
    await loadThumbnails();
    setStatus("Done.");
  } catch (e) {
    setStatus(`Error: ${(e as Error).message}`);
    previewPanel.hidden = false;
  } finally {
    confirmBtn.disabled = false;
  }
});

cancelBtn.addEventListener("click", () => {
  previewPanel.hidden = true;
  pendingPreview = null;
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
    const { hasLastOperation } = await apiFetch<{ hasLastOperation: boolean }>(
      "/api/session",
    );
    revertBtn.style.display = hasLastOperation ? "block" : "none";
  } catch {
    // ignore
  }
}

refreshSession();
