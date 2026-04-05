#!/usr/bin/env bash
# build.sh — holo-hoin model export script
# Produces models/holo-hoin/holo-hoin.onnx from a trained checkpoint.
#
# Usage:
#   ./build.sh                        # expects ./checkpoints/best_model.pth
#   CHECKPOINT_DIR=./checkpoints ./build.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-"${SCRIPT_DIR}/checkpoints"}"
OUT="${SCRIPT_DIR}/holo-hoin.onnx"

cd "${SCRIPT_DIR}"

uv run python export_onnx.py \
  --checkpoint-dir "${CHECKPOINT_DIR}" \
  --opset 18

# rename to match the repo contract (<name>.onnx)
mv "${CHECKPOINT_DIR}/best_model.onnx" "${OUT}"

# copy sidecar artifacts if present
for f in class_map.json config.json; do
  [[ -f "${CHECKPOINT_DIR}/${f}" ]] && cp "${CHECKPOINT_DIR}/${f}" "${SCRIPT_DIR}/${f}"
done

echo "artifact: ${OUT}"
