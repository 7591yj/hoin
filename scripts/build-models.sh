#!/usr/bin/env bash

set -euo pipefail

shopt -s nullglob

mode="${1:-build}"
shift || true

requested_models=("$@")
ran_any=false

should_run_model() {
  local model_name="$1"

  if [ "${#requested_models[@]}" -eq 0 ]; then
    return 0
  fi

  for requested in "${requested_models[@]}"; do
    if [ "${requested}" = "${model_name}" ]; then
      return 0
    fi
  done

  return 1
}

for dir in models/*; do
  [ -d "${dir}" ] || continue

  name="$(basename "${dir}")"
  script="${dir}/build.sh"
  output="${dir}/${name}.onnx"

  if [ ! -f "${script}" ]; then
    echo "Skipping ${dir}: missing build.sh"
    continue
  fi

  if ! should_run_model "${name}"; then
    continue
  fi

  ran_any=true
  echo "${mode^} model: ${name}"

  bash "${script}"

  if [ ! -f "${output}" ]; then
    echo "Expected ONNX artifact was not produced: ${output}" >&2
    exit 1
  fi
done

if [ "${ran_any}" = false ]; then
  if [ "${#requested_models[@]}" -eq 0 ]; then
    echo "No model directories with build.sh found under models/; skipping."
  else
    echo "No requested models were built: ${requested_models[*]}" >&2
    exit 1
  fi
fi
