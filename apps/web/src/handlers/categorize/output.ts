import type { ApplyJsonOutput, CategorizeJsonOutput, MoveEntry } from "../../types/categorize.ts";

function countOthersMoves(moves: MoveEntry[]): number {
  return moves.filter((move) => move.routed_to_others === true).length;
}

export function applyPlanForMoves(moves: MoveEntry[]): CategorizeJsonOutput {
  return {
    dry_run: true,
    moves,
    skipped: [],
    already_categorized: [],
    failed: [],
    summary: {
      scanned: 0,
      image_candidates: 0,
      moves: moves.length,
      routed_to_others: countOthersMoves(moves),
      low_confidence_skipped: 0,
      already_categorized: 0,
      failed: 0,
    },
  };
}

export function applyOutputForMoves(moves: MoveEntry[]): ApplyJsonOutput {
  return {
    moves,
    summary: {
      applied: moves.length,
      routed_to_others: countOthersMoves(moves),
    },
  };
}
