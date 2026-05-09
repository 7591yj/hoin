import type { CategorizeProgress } from "../types/categorize.ts";
import type { apiFetch } from "./api.ts";

interface ProgressElements {
  statusProgress: HTMLDivElement;
  statusProgressLabel: HTMLSpanElement;
  statusProgressTrack: HTMLDivElement;
  statusProgressFill: HTMLDivElement;
}

interface ProgressControllerOptions extends ProgressElements {
  apiFetch: typeof apiFetch;
  setStatus: (message: string, loading?: boolean) => void;
}

export function renderBottomProgress(
  elements: ProgressElements,
  progress: CategorizeProgress | null,
): void {
  const { statusProgress, statusProgressLabel, statusProgressTrack, statusProgressFill } = elements;

  if (!progress || progress.state === "idle") {
    statusProgress.hidden = true;
    statusProgressLabel.textContent = "";
    statusProgressTrack.classList.remove("indeterminate");
    statusProgressTrack.setAttribute("aria-valuenow", "0");
    statusProgressFill.style.width = "0%";
    return;
  }

  statusProgress.hidden = false;
  const total = progress.total;
  const hasTotal = typeof total === "number" && total > 0;
  const percent = hasTotal ? Math.min(100, (progress.completed / total) * 100) : 0;

  const progressLabel =
    progress.phase === "preview" ? "Preview" : progress.phase === "apply" ? "Apply" : "Revert";
  statusProgressLabel.textContent = hasTotal
    ? `${progressLabel} ${progress.completed}/${total}`
    : `${progressLabel} in progress`;
  statusProgressTrack.classList.toggle("indeterminate", !hasTotal && progress.state === "running");
  statusProgressTrack.setAttribute("aria-valuenow", hasTotal ? String(Math.round(percent)) : "0");
  statusProgressFill.style.width = hasTotal ? `${percent}%` : "0%";
}

export function createProgressController(options: ProgressControllerOptions): {
  render: (progress: CategorizeProgress | null) => void;
  poll: (stopWhenSettled?: boolean) => Promise<void>;
  start: () => void;
  stop: () => void;
} {
  let progressPollTimer: number | null = null;
  const elements: ProgressElements = options;

  function stop(): void {
    if (progressPollTimer !== null) {
      window.clearInterval(progressPollTimer);
      progressPollTimer = null;
    }
  }

  async function poll(stopWhenSettled = false): Promise<void> {
    try {
      const progress = await options.apiFetch<CategorizeProgress>("/api/categorize/progress");
      renderBottomProgress(elements, progress);
      if (progress.state === "running") {
        options.setStatus(progress.message, true);
      }
      if (stopWhenSettled && (progress.state === "done" || progress.state === "error")) {
        stop();
      }
    } catch {
      // ignore polling failures
    }
  }

  function start(): void {
    stop();
    void poll();
    progressPollTimer = window.setInterval(() => {
      void poll(true);
    }, 300);
  }

  return {
    render: (progress) => renderBottomProgress(elements, progress),
    poll,
    start,
    stop,
  };
}
