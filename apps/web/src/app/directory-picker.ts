import { parentDir } from "../path-utils.ts";

interface BrowseEntry {
  name: string;
  path: string;
  isDir: boolean;
}

const PICKER_ROOTS_VIEW = "__allowed_roots__";

type ApiFetch = <T>(path: string, opts?: RequestInit) => Promise<T>;
type ElementGetter = <T extends HTMLElement>(id: string) => T;

interface DirectoryPickerOptions {
  el: ElementGetter;
  apiFetch: ApiFetch;
  getAllowedRoots: () => string[];
  getServerCwd: () => string;
}

export function initDirectoryPicker({
  el,
  apiFetch,
  getAllowedRoots,
  getServerCwd,
}: DirectoryPickerOptions): void {
  const pickerOverlay = el<HTMLDivElement>("dir-picker-overlay");
  const pickerCwd = el<HTMLSpanElement>("dir-picker-cwd");
  const pickerList = el<HTMLUListElement>("dir-picker-list");
  const pickerUpBtn = el<HTMLButtonElement>("dir-picker-up");
  const pickerSelectBtn = el<HTMLButtonElement>("dir-picker-select");
  const pickerCancelBtn = el<HTMLButtonElement>("dir-picker-cancel");

  let pickerTargetInput: HTMLInputElement | null = null;
  let pickerCurrentDir = PICKER_ROOTS_VIEW;
  let pickerSelectedDir: string | null = null;

  function allowedRoots(): string[] {
    return getAllowedRoots();
  }

  function isWithinAllowedRoot(dir: string): boolean {
    return allowedRoots().some(
      (root) => dir === root || dir.startsWith(`${root}/`) || dir.startsWith(`${root}\\`),
    );
  }

  function selectListItem(li: HTMLLIElement, path: string): void {
    pickerList.querySelectorAll("li").forEach((el) => {
      el.classList.remove("selected");
    });
    li.classList.add("selected");
    pickerSelectedDir = path;
  }

  function renderAllowedRoots(): void {
    pickerCurrentDir = PICKER_ROOTS_VIEW;
    pickerSelectedDir = null;
    pickerCwd.textContent = "Allowed locations";
    pickerList.innerHTML = "";

    for (const root of allowedRoots()) {
      const li = document.createElement("li");
      li.textContent = root;
      li.dataset.path = root;
      li.addEventListener("click", () => selectListItem(li, root));
      li.addEventListener("dblclick", () => void pickerNavigate(root));
      pickerList.appendChild(li);
    }
  }

  async function openPicker(targetInput: HTMLInputElement): Promise<void> {
    pickerTargetInput = targetInput;
    pickerSelectedDir = null;
    const startDir = targetInput.value.trim() || getServerCwd();
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
          li.addEventListener("click", () => selectListItem(li, d.path));
          li.addEventListener("dblclick", () => void pickerNavigate(d.path));
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
    if (allowedRoots().includes(pickerCurrentDir) || !isWithinAllowedRoot(parent)) {
      renderAllowedRoots();
      return;
    }

    void pickerNavigate(parent);
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
      void openPicker(el<HTMLInputElement>(targetId));
    });
  });
}
