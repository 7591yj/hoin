export interface MoveEntry {
  from: string;
  to: string;
  class_key: string;
  confidence: number;
}

interface LastOperation {
  moves: MoveEntry[];
  timestamp: number;
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

export const session: {
  lastOperation: LastOperation | null;
  categorizeProgress: CategorizeProgress;
} = {
  lastOperation: null,
  categorizeProgress: {
    phase: "preview",
    state: "idle",
    completed: 0,
    total: null,
    message: "Ready",
    startedAt: null,
    updatedAt: null,
  },
};
