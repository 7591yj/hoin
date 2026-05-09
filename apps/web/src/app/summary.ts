import type { ApplyJsonOutput, CategorizeResult } from "../types/categorize.ts";

function renderSummaryItems(summaryGrid: HTMLElement, items: [string, number][]): void {
  summaryGrid.innerHTML = items
    .map(
      ([label, val]) => `
    <div class="summary-item"><strong>${val}</strong>${label}</div>
  `,
    )
    .join("");
}

export function renderSummary(summaryGrid: HTMLElement, s: CategorizeResult["summary"]): void {
  renderSummaryItems(summaryGrid, [
    ["Scanned", s.scanned],
    ["Moved", s.moves],
    ["Others", s.routed_to_others],
    ["Low conf.", s.low_confidence_skipped],
    ["Already done", s.already_categorized],
    ["Failed", s.failed],
  ]);
}

export function renderApplySummary(summaryGrid: HTMLElement, s: ApplyJsonOutput["summary"]): void {
  renderSummaryItems(summaryGrid, [
    ["Applied", s.applied],
    ["Others", s.routed_to_others],
  ]);
}
