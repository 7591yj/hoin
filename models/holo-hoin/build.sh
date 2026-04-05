#!/usr/bin/env bash
# Downloads the holo-hoin ONNX model from the anihoin GitHub release.
# Run this script from the repository root before building with HOIN_EMBED_MODEL=holo-hoin.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_NAME="holo-hoin"
RELEASE_URL="https://github.com/faransansj/anihoin/releases/latest/download"
ONNX="${SCRIPT_DIR}/${MODEL_NAME}.onnx"
ONNX_DATA="${SCRIPT_DIR}/${MODEL_NAME}.onnx.data"

if [ -f "${ONNX}" ]; then
  echo "${MODEL_NAME}: ONNX artifact already present, skipping download."
  exit 0
fi

echo "${MODEL_NAME}: Downloading ONNX model from GitHub release..."
curl -fSL "${RELEASE_URL}/best_model.onnx" -o "${ONNX}"
curl -fSL "${RELEASE_URL}/best_model.onnx.data" -o "${ONNX_DATA}"
echo "${MODEL_NAME}: Download complete."
