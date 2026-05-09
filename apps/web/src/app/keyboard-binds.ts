import type { CategorizeResult } from "../types/categorize.ts";

interface KeyboardShortcutOptions {
  helpButton: HTMLButtonElement;
  categorizeBtn: HTMLButtonElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  previewPanel: HTMLDivElement;
  getSelectedFiles: () => Set<string>;
  setSelectedFiles: (paths: Iterable<string>) => void;
  getPendingPreview: () => CategorizeResult | null;
  updatePreviewPanel: () => void;
  setStatus: (message: string, loading?: boolean) => void;
}

type ShortcutCommandId =
  | "showGuide"
  | "primaryAction"
  | "cancelPreview"
  | "selectVisible"
  | "clearSelection"
  | "moveThumbnailFocus"
  | "toggleFocusedThumbnail";

interface ShortcutCommand {
  id: ShortcutCommandId;
  keys: string;
  action: string;
  matches: (event: KeyboardEvent) => boolean;
}

const ARROW_KEYS = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
const FOCUSABLE_DIALOG_SELECTOR =
  "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

const SHORTCUT_COMMANDS: ShortcutCommand[] = [
  {
    id: "showGuide",
    keys: "?",
    action: "Show keyboard shortcut guide",
    matches: (event) => event.key === "?",
  },
  {
    id: "primaryAction",
    keys: "Ctrl/⌘ + Enter",
    action: "Categorize, or apply while reviewing planned moves",
    matches: (event) => (event.ctrlKey || event.metaKey) && event.key === "Enter",
  },
  {
    id: "cancelPreview",
    keys: "Esc",
    action: "Cancel planned moves or close this guide",
    matches: (event) => event.key === "Escape",
  },
  {
    id: "selectVisible",
    keys: "Ctrl/⌘ + A",
    action: "Select all visible images",
    matches: (event) => (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a",
  },
  {
    id: "clearSelection",
    keys: "Ctrl/⌘ + D",
    action: "Clear image selection",
    matches: (event) => (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d",
  },
  {
    id: "moveThumbnailFocus",
    keys: "←/→/↑/↓",
    action: "Move focus between image thumbnails",
    matches: (event) => ARROW_KEYS.includes(event.key),
  },
  {
    id: "toggleFocusedThumbnail",
    keys: "Space/Enter",
    action: "Toggle the focused thumbnail",
    matches: (event) => event.key === " " || event.key === "Enter",
  },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

function visibleThumbnailButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(".thumb[data-path]")].filter(
    (button) => !button.hidden && button.offsetParent !== null,
  );
}

function createHelpDialog(): {
  overlay: HTMLDivElement;
  dialog: HTMLDivElement;
  closeButton: HTMLButtonElement;
} {
  const overlay = document.createElement("div");
  overlay.id = "shortcuts-overlay";
  overlay.hidden = true;

  const dialog = document.createElement("div");
  dialog.id = "shortcuts-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "shortcuts-title");
  dialog.tabIndex = -1;

  const header = document.createElement("div");
  header.className = "shortcuts-header";

  const title = document.createElement("h2");
  title.id = "shortcuts-title";
  title.textContent = "Keyboard shortcuts";

  const close = document.createElement("button");
  close.id = "shortcuts-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close keyboard shortcut guide");
  close.textContent = "×";

  const list = document.createElement("div");
  list.className = "shortcuts-list";
  for (const { keys, action } of SHORTCUT_COMMANDS) {
    const row = document.createElement("div");
    row.className = "shortcut-row";
    const key = document.createElement("kbd");
    key.textContent = keys;
    const label = document.createElement("span");
    label.textContent = action;
    row.append(key, label);
    list.appendChild(row);
  }

  header.append(title, close);
  dialog.append(header, list);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  return { overlay, dialog, closeButton: close };
}

export function initKeyboardShortcuts(options: KeyboardShortcutOptions): () => void {
  const { overlay, dialog, closeButton } = createHelpDialog();
  let lastFocus: HTMLElement | null = null;

  function getDialogFocusableElements(): HTMLElement[] {
    return [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE_DIALOG_SELECTOR)].filter(
      (element) => !element.hasAttribute("disabled") && element.offsetParent !== null,
    );
  }

  function focusFirstDialogElement(): void {
    (getDialogFocusableElements()[0] ?? dialog).focus();
  }

  function showGuide(): void {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false;
    focusFirstDialogElement();
  }

  function hideGuide(): void {
    overlay.hidden = true;
    lastFocus?.focus();
  }

  function activatePrimaryAction(): void {
    const reviewing = !options.previewPanel.hidden && options.getPendingPreview();
    const button = reviewing ? options.confirmBtn : options.categorizeBtn;
    if (!button.disabled) button.click();
  }

  function selectVisibleThumbnails(): void {
    const thumbnails = visibleThumbnailButtons();
    const paths = thumbnails.flatMap((button) =>
      button.dataset.path ? [button.dataset.path] : [],
    );
    options.setSelectedFiles(paths);
    for (const button of thumbnails) button.classList.add("thumb--selected");
    if (options.getPendingPreview()) options.updatePreviewPanel();
    options.setStatus(`${paths.length} visible image(s) selected.`);
  }

  function clearSelection(): void {
    const thumbnails = visibleThumbnailButtons();
    options.setSelectedFiles([]);
    for (const button of thumbnails) button.classList.remove("thumb--selected");
    if (options.getPendingPreview()) options.updatePreviewPanel();
    options.setStatus("Selection cleared.");
  }

  function moveThumbnailFocus(key: string): boolean {
    const thumbnails = visibleThumbnailButtons();
    if (thumbnails.length === 0) return false;

    const current =
      document.activeElement instanceof HTMLButtonElement &&
      thumbnails.includes(document.activeElement)
        ? document.activeElement
        : thumbnails[0];

    const items = thumbnails
      .map((thumbnail) => ({ thumbnail, rect: thumbnail.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

    const firstItem = items[0];
    if (!firstItem) return false;

    const rowTolerance = Math.max(4, firstItem.rect.height * 0.25);
    const rows: (typeof items)[] = [];
    for (const item of items) {
      const row = rows.find((candidate) => {
        const firstInRow = candidate[0];
        return (
          firstInRow !== undefined && Math.abs(firstInRow.rect.top - item.rect.top) <= rowTolerance
        );
      });
      if (row) row.push(item);
      else rows.push([item]);
    }
    for (const row of rows) row.sort((a, b) => a.rect.left - b.rect.left);

    const rowIndex = rows.findIndex((row) => row.some((item) => item.thumbnail === current));
    const currentRow = rows[rowIndex];
    if (!currentRow) return false;
    const columnIndex = currentRow.findIndex((item) => item.thumbnail === current);
    const currentItem = currentRow[columnIndex];
    if (!currentItem) return false;

    if (key === "ArrowRight") {
      const target = currentRow[columnIndex + 1] ?? rows[rowIndex + 1]?.[0];
      if (!target) return false;
      target.thumbnail.focus();
      return true;
    }

    if (key === "ArrowLeft") {
      const previousRow = rows[rowIndex - 1];
      const target = currentRow[columnIndex - 1] ?? previousRow?.[previousRow.length - 1];
      if (!target) return false;
      target.thumbnail.focus();
      return true;
    }

    if (key !== "ArrowDown" && key !== "ArrowUp") return false;

    const currentCenterX = currentItem.rect.left + currentItem.rect.width / 2;
    const focusClosestInRow = (row: (typeof rows)[number]): void => {
      const target = row.reduce(
        (best, item) => {
          const bestCenterX = best.rect.left + best.rect.width / 2;
          const itemCenterX = item.rect.left + item.rect.width / 2;
          return Math.abs(itemCenterX - currentCenterX) < Math.abs(bestCenterX - currentCenterX)
            ? item
            : best;
        },
        row[Math.min(columnIndex, row.length - 1)] ?? row[0],
      );
      target?.thumbnail.focus();
    };

    if (key === "ArrowDown") {
      const nextRow = rows[rowIndex + 1];
      if (nextRow) {
        focusClosestInRow(nextRow);
        return true;
      }

      const columnStart = rows.find((row) => row[columnIndex])?.[columnIndex];
      if (!columnStart) return false;
      columnStart.thumbnail.focus();
      return true;
    }

    const previousRow = rows[rowIndex - 1];
    if (previousRow) {
      focusClosestInRow(previousRow);
      return true;
    }

    const columnEnd = [...rows].reverse().find((row) => row[columnIndex])?.[columnIndex];
    if (!columnEnd) return false;
    columnEnd.thumbnail.focus();
    return true;
  }

  const handleHelpButtonClick = (): void => showGuide();
  const handleOverlayClick = (event: MouseEvent): void => {
    if (event.target === overlay) hideGuide();
  };
  const handleCloseButtonClick = (): void => hideGuide();
  const trapDialogFocus = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;

    const focusableElements = getDialogFocusableElements();
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    if (!first || !last) return;

    if (!overlay.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!overlay.hidden) {
      trapDialogFocus(event);
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        hideGuide();
      }
      return;
    }

    if (isTypingTarget(event.target)) return;

    const command = SHORTCUT_COMMANDS.find((candidate) => candidate.matches(event));
    if (!command) return;

    switch (command.id) {
      case "showGuide":
        event.preventDefault();
        showGuide();
        return;
      case "primaryAction":
        event.preventDefault();
        activatePrimaryAction();
        return;
      case "cancelPreview":
        if (!options.previewPanel.hidden && options.getPendingPreview()) {
          event.preventDefault();
          options.cancelBtn.click();
        }
        return;
      case "selectVisible":
        event.preventDefault();
        selectVisibleThumbnails();
        return;
      case "clearSelection":
        event.preventDefault();
        clearSelection();
        return;
      case "moveThumbnailFocus":
        if (moveThumbnailFocus(event.key)) event.preventDefault();
        return;
      case "toggleFocusedThumbnail":
        return;
    }
  };

  options.helpButton.addEventListener("click", handleHelpButtonClick);
  const handleFocusIn = (event: FocusEvent): void => {
    if (!overlay.hidden && !overlay.contains(event.target as Node | null)) {
      focusFirstDialogElement();
    }
  };

  overlay.addEventListener("click", handleOverlayClick);
  closeButton.addEventListener("click", handleCloseButtonClick);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("focusin", handleFocusIn);

  return () => {
    options.helpButton.removeEventListener("click", handleHelpButtonClick);
    overlay.removeEventListener("click", handleOverlayClick);
    closeButton.removeEventListener("click", handleCloseButtonClick);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("focusin", handleFocusIn);
    overlay.remove();
  };
}
