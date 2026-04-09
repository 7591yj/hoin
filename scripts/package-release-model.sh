#!/usr/bin/env bash

set -euo pipefail

model_name="${1:?model name is required}"
version="${2:?version is required}"
dist_dir="${3:?dist directory is required}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template_path="${script_dir}/model-release-readme-template.md"
model_dir="models/${model_name}"
onnx_path="${model_dir}/${model_name}.onnx"
artifact_name="hoin-${version}-model-${model_name}"
artifact_dir="${dist_dir}/${artifact_name}"
package_model_dir="${artifact_dir}/models/${model_name}"

if [ ! -f "${onnx_path}" ]; then
  echo "Expected ONNX artifact was not produced: ${onnx_path}" >&2
  exit 1
fi

mkdir -p "${package_model_dir}"
cp "${onnx_path}" "${package_model_dir}/"

for optional_file in \
  "${model_dir}/${model_name}.onnx.data" \
  "${model_dir}/class_map.json" \
  "${model_dir}/config.json" \
  "${model_dir}/README.md"; do
  if [ -f "${optional_file}" ]; then
    cp "${optional_file}" "${package_model_dir}/"
  fi
done

python - "${package_model_dir}/hoin-model.json" "${model_name}" <<'PY'
from pathlib import Path
import json
import sys

output_path = Path(sys.argv[1])
model_name = sys.argv[2]
manifest = {
    "schema_version": 1,
    "name": model_name,
    "onnx": f"{model_name}.onnx",
}

onnx_data = output_path.parent / f"{model_name}.onnx.data"
if onnx_data.is_file():
    manifest["onnx_data"] = f"{model_name}.onnx.data"

output_path.write_text(json.dumps(manifest, indent=2) + "\n")
PY

python - "${template_path}" "${artifact_dir}/README.md" "${model_name}" <<'PY'
from pathlib import Path
import sys

template_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
model_name = sys.argv[3]

contents = template_path.read_text()
contents = contents.replace("@@MODEL_NAME@@", model_name)
output_path.write_text(contents)
PY

tar -C "${dist_dir}" -czf "${dist_dir}/${artifact_name}.tar.gz" "${artifact_name}"
