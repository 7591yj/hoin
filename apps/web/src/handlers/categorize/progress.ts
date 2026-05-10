import { session } from "../../session.ts";

export function setPreviewRunningProgress(selectedFiles: string[]): void {
  session.categorizeProgress = {
    phase: "preview",
    state: "running",
    completed: 0,
    total: selectedFiles.length > 0 ? selectedFiles.length : null,
    message:
      selectedFiles.length > 0
        ? `Categorizing ${selectedFiles.length} selected image(s)…`
        : "Categorizing images…",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function setPreviewProgress(completed: number, total: number): void {
  session.categorizeProgress = {
    phase: "preview",
    state: "running",
    completed,
    total,
    message: `Categorizing ${completed}/${total} image(s)…`,
    startedAt: session.categorizeProgress.startedAt,
    updatedAt: Date.now(),
  };
}

export function setPreviewDoneProgress(scanned: number, moves: number): void {
  session.categorizeProgress = {
    phase: "preview",
    state: "done",
    completed: scanned,
    total: scanned,
    message: `Prepared ${moves} move(s) from ${scanned} scanned image(s).`,
    startedAt: session.categorizeProgress.startedAt,
    updatedAt: Date.now(),
  };
}

export function setPreviewErrorProgress(message: string): void {
  session.categorizeProgress = {
    phase: "preview",
    state: "error",
    completed: 0,
    total: null,
    message,
    startedAt: session.categorizeProgress.startedAt,
    updatedAt: Date.now(),
  };
}

export function setApplyProgress(
  completed: number,
  total: number | null,
  state: "running" | "done" = "running",
  message?: string,
): void {
  session.categorizeProgress = {
    phase: "apply",
    state,
    completed,
    total,
    message:
      message ??
      (state === "done"
        ? `Applied ${completed} move(s).`
        : `Applying ${completed}/${total ?? "?"} move(s)…`),
    startedAt: session.categorizeProgress.startedAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}

export function setApplyErrorProgress(message: string, total: number): void {
  session.categorizeProgress = {
    phase: "apply",
    state: "error",
    completed: 0,
    total,
    message,
    startedAt: session.categorizeProgress.startedAt,
    updatedAt: Date.now(),
  };
}
