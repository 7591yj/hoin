import { basename } from "../path-utils.ts";
import type { CategorizeResult } from "../types/categorize.ts";
import type { apiFetch } from "./api.ts";

interface BrowseEntry {
  name: string;
  path: string;
  isDir: boolean;
  isImage: boolean;
}

type PreviewMap = Map<string, { class_key: string; confidence: number }>;

interface ThumbnailOptions {
  apiFetch: typeof apiFetch;
  targetDirInput: HTMLInputElement;
  targetError: HTMLElement;
  thumbnailsEl: HTMLDivElement;
  getSelectedFiles: () => Set<string>;
  setSelectedFiles: (paths: Iterable<string>) => void;
  getPendingPreview: () => CategorizeResult | null;
  getPreviewMap: () => PreviewMap;
  updatePreviewPanel: () => void;
  showError: (element: HTMLElement, message: string) => void;
  setStatus: (message: string, loading?: boolean) => void;
}

function emptyState(message: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = "empty-state";
  p.textContent = message;
  return p;
}

export function createThumbnailLoader(options: ThumbnailOptions): () => Promise<void> {
  return async function loadThumbnails(): Promise<void> {
    const dir = options.targetDirInput.value.trim();
    if (!dir) {
      options.setSelectedFiles([]);
      options.thumbnailsEl.replaceChildren(emptyState("Select a target directory to see files."));
      return;
    }

    options.showError(options.targetError, "");
    options.setStatus("Loading files…", true);
    try {
      const { entries } = await options.apiFetch<{ entries: BrowseEntry[] }>(
        `/api/browse?path=${encodeURIComponent(dir)}&recursive=1`,
      );
      const images = entries.filter((e) => e.isImage);
      const visiblePaths = new Set(images.map((entry) => entry.path));
      options.setSelectedFiles(
        [...options.getSelectedFiles()].filter((file) => visiblePaths.has(file)),
      );

      if (images.length === 0) {
        options.thumbnailsEl.replaceChildren(emptyState("No images found in this directory."));
      } else {
        renderThumbnails(options, images);
      }
      options.setStatus(`${images.length} image(s) found.`);
    } catch (e) {
      options.showError(options.targetError, (e as Error).message);
      options.thumbnailsEl.replaceChildren();
      options.setStatus("Failed to load files.");
    }
  };
}

function renderThumbnails(options: ThumbnailOptions, images: BrowseEntry[]): void {
  const selectedFiles = options.getSelectedFiles();
  const previewMap = options.getPreviewMap();
  const pendingPreview = options.getPendingPreview();

  options.thumbnailsEl.replaceChildren();
  for (const entry of images) {
    const preview = previewMap.get(entry.path);
    if (pendingPreview && !preview) continue;

    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "thumb";
    if (preview) thumb.classList.add("thumb--predicted");
    if (selectedFiles.has(entry.path)) thumb.classList.add("thumb--selected");
    thumb.dataset.path = entry.path;

    const img = document.createElement("img");
    img.src = `/api/thumbnail?path=${encodeURIComponent(entry.path)}`;
    img.loading = "lazy";
    img.alt = entry.name || basename(entry.path);
    thumb.appendChild(img);

    if (preview) {
      const label = document.createElement("div");
      label.className = "thumb-label";
      label.append(preview.class_key.replace(/_/g, " "));
      const confidence = document.createElement("span");
      confidence.className = "thumb-conf";
      confidence.textContent = `${(preview.confidence * 100).toFixed(0)}%`;
      label.appendChild(confidence);
      thumb.appendChild(label);
    }

    const name = document.createElement("div");
    name.className = "thumb-name";
    name.textContent = entry.name;
    thumb.appendChild(name);

    thumb.addEventListener("click", () => {
      const next = new Set(options.getSelectedFiles());
      if (next.has(entry.path)) {
        next.delete(entry.path);
        thumb.classList.remove("thumb--selected");
      } else {
        next.add(entry.path);
        thumb.classList.add("thumb--selected");
      }
      options.setSelectedFiles(next);
      if (options.getPendingPreview()) options.updatePreviewPanel();
    });
    options.thumbnailsEl.appendChild(thumb);
  }
}
