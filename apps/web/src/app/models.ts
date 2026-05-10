import type { apiFetch } from "./api.ts";

interface ModelEntry {
  name: string;
  path: string;
}

interface ModelScannerOptions {
  apiFetch: typeof apiFetch;
  modelsRootInput: HTMLInputElement;
  modelSelect: HTMLSelectElement;
  modelError: HTMLElement;
  showError: (element: HTMLElement, message: string) => void;
  setStatus: (message: string, loading?: boolean) => void;
}

export function activeModelDir(
  modelDirInput: HTMLInputElement,
  modelSelect: HTMLSelectElement,
): string {
  return modelDirInput.value.trim() || modelSelect.value || "";
}

export function initModelScanner({
  apiFetch,
  modelsRootInput,
  modelSelect,
  modelError,
  showError,
  setStatus,
}: ModelScannerOptions): void {
  const root = modelsRootInput.value.trim();
  if (!root) {
    showError(modelError, "Enter a models root directory first.");
    return;
  }
  showError(modelError, "");
  setStatus("Scanning for models…", true);
  void apiFetch<{ models: ModelEntry[] }>(`/api/models?root=${encodeURIComponent(root)}`)
    .then(({ models }) => {
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
    })
    .catch((e) => {
      showError(modelError, (e as Error).message);
      setStatus("Error scanning models.");
    });
}
