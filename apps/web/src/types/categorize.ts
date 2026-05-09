export interface MoveEntry {
  from: string;
  to: string;
  class_key: string;
  confidence: number;
  routed_to_others?: boolean;
}

export interface SkippedEntry {
  file: string;
  reason: string;
  confidence?: number;
}

export interface AlreadyCategorizedEntry {
  file: string;
}

export interface FailedEntry {
  file: string;
  reason: string;
}

export interface CategorizeSummary {
  scanned: number;
  image_candidates: number;
  moves: number;
  routed_to_others: number;
  low_confidence_skipped: number;
  already_categorized: number;
  failed: number;
}

export interface CategorizeJsonOutput {
  dry_run: boolean;
  moves: MoveEntry[];
  skipped: SkippedEntry[];
  already_categorized: AlreadyCategorizedEntry[];
  failed: FailedEntry[];
  summary: CategorizeSummary;
}

export type CategorizeResult = CategorizeJsonOutput;

export interface CategorizeProgressEvent {
  event: "file_done";
  completed: number;
  total: number;
  file: string;
}

export interface OperationJsonOutput {
  moves: MoveEntry[];
}

export interface CategorizeProgress {
  phase: "preview" | "apply";
  state: "idle" | "running" | "done" | "error";
  completed: number;
  total: number | null;
  message: string;
  startedAt: number | null;
  updatedAt: number | null;
}
