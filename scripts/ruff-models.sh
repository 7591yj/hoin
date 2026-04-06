#!/usr/bin/env bash

set -euo pipefail

mode="${1:-check}"
shift || true

ruff_args=()

if [ "${mode}" = "lint" ] && [ "${1:-}" = "--fix" ]; then
  ruff_args+=(--fix)
  shift
fi

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

is_python_model() {
  local model_dir="$1"

  find "${model_dir}" -type f \( -name '*.py' -o -name 'pyproject.toml' \) -print -quit | grep -q .
}

run_ruff() {
  local model_dir="$1"

  case "${mode}" in
    format)
      ruff format "${model_dir}"
      ;;
    lint)
      ruff check "${ruff_args[@]}" "${model_dir}"
      ;;
    check)
      ruff format --check "${model_dir}"
      ruff check "${model_dir}"
      ;;
    *)
      echo "Unsupported mode: ${mode}" >&2
      echo "Expected one of: format, lint, check" >&2
      exit 1
      ;;
  esac
}

for dir in models/*; do
  [ -d "${dir}" ] || continue

  name="$(basename "${dir}")"

  if ! should_run_model "${name}"; then
    continue
  fi

  if ! is_python_model "${dir}"; then
    echo "Skipping ${dir}: no Python sources detected"
    continue
  fi

  ran_any=true
  echo "Ruff ${mode}: ${name}"
  run_ruff "${dir}"
done

if [ "${ran_any}" = false ]; then
  if [ "${#requested_models[@]}" -eq 0 ]; then
    echo "No Python model directories found under models/; skipping."
  else
    echo "No requested Python models were matched: ${requested_models[*]}" >&2
    exit 1
  fi
fi
