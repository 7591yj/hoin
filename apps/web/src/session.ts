import type { CategorizeProgress, MoveEntry } from "./types/categorize.ts";

interface LastOperation {
  moves: MoveEntry[];
  timestamp: number;
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
