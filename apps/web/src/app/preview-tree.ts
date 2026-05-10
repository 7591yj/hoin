import { basename, dirname } from "../path-utils.ts";
import type { MoveEntry } from "../types/categorize.ts";

export function renderMoveTree(treeRoot: HTMLElement, moves: MoveEntry[]): void {
  const tree: Record<string, MoveEntry[]> = {};
  for (const move of moves) {
    const dir = dirname(move.to);
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push(move);
  }

  const dirs = Object.keys(tree).sort();
  if (dirs.length === 0) {
    const empty = document.createElement("span");
    empty.style.color = "var(--muted)";
    empty.textContent = "No moves planned.";
    treeRoot.replaceChildren(empty);
    return;
  }

  treeRoot.replaceChildren();
  for (const dir of dirs) {
    const dirEl = document.createElement("div");
    dirEl.className = "tree-dir";
    dirEl.dataset.treeDir = "";
    dirEl.textContent = dir;
    treeRoot.appendChild(dirEl);

    const filesEl = document.createElement("div");
    filesEl.className = "tree-files";
    for (const move of tree[dir]) {
      const fileEl = document.createElement("div");
      fileEl.className = "tree-file";

      const nameEl = document.createElement("span");
      nameEl.textContent = basename(move.from);
      fileEl.appendChild(nameEl);

      const confidenceEl = document.createElement("span");
      confidenceEl.className = "conf";
      confidenceEl.textContent = `${(move.confidence * 100).toFixed(0)}%`;
      fileEl.appendChild(confidenceEl);

      filesEl.appendChild(fileEl);
    }
    treeRoot.appendChild(filesEl);
  }

  treeRoot.querySelectorAll<HTMLElement>("[data-tree-dir]").forEach((dirEl) => {
    dirEl.addEventListener("click", () => {
      dirEl.classList.toggle("open");
      (dirEl.nextElementSibling as HTMLElement).classList.toggle("visible");
    });
  });
}
