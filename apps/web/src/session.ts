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

export const session: { lastOperation: LastOperation | null } = {
  lastOperation: null,
};
