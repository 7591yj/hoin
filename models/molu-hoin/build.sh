#!/usr/bin/env bash
# build.sh — molu-hoin model export script
# Produces models/molu-hoin/molu-hoin.onnx from a trained checkpoint.
#
# Usage:
#   ./build.sh                        # expects ./checkpoints/molu-hoin.pth
#   CHECKPOINT_DIR=./checkpoints ./build.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-"${SCRIPT_DIR}/checkpoints"}"
OUT="${SCRIPT_DIR}/molu-hoin.onnx"
OUT_DATA="${SCRIPT_DIR}/molu-hoin.onnx.data"
CHECKPOINT_PTH="${CHECKPOINT_DIR}/molu-hoin.pth"
CHECKPOINT_CLASS_MAP="${CHECKPOINT_DIR}/class_map.json"

cd "${SCRIPT_DIR}"

# if checkpoints are absent treat an existing committed artifact as the source of truth
if [[ ! -f "${CHECKPOINT_PTH}" || ! -f "${CHECKPOINT_CLASS_MAP}" ]]; then
  if [[ -f "${OUT}" ]]; then
    echo "checkpoint inputs not found; using existing artifact ${OUT}"
    exit 0
  fi

  echo "missing checkpoint inputs under ${CHECKPOINT_DIR}" >&2
  echo "expected ${CHECKPOINT_PTH} and ${CHECKPOINT_CLASS_MAP}, or an existing ${OUT}" >&2
  exit 1
fi

# Skip export if artifact already exists and uv is unavailable (e.g. CI)
if [[ -f "${OUT}" ]] && ! command -v uv &>/dev/null; then
  echo "uv not found and artifact already exists — skipping export"
  exit 0
fi

if [[ ! -f "${SCRIPT_DIR}/export_onnx.py" ]]; then
  echo "missing ${SCRIPT_DIR}/export_onnx.py; cannot re-export from checkpoint" >&2
  echo "either commit the export script or rely on the existing ${OUT}" >&2
  exit 1
fi

uv run python export_onnx.py \
  --checkpoint-dir "${CHECKPOINT_DIR}" \
  --output-dir "${SCRIPT_DIR}" \
  --opset 18

# Ensure this model stays in single-file ONNX mode.
rm -f "${OUT_DATA}"

# copy sidecar artifacts if present
for f in class_map.json config.json; do
  [[ -f "${CHECKPOINT_DIR}/${f}" ]] && cp "${CHECKPOINT_DIR}/${f}" "${SCRIPT_DIR}/${f}"
done

echo "artifact: ${OUT}"
