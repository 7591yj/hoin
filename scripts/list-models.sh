#!/usr/bin/env bash

set -euo pipefail

shopt -s nullglob

models=()

for dir in models/*; do
  [ -d "${dir}" ] || continue

  name="$(basename "${dir}")"
  if [ -f "${dir}/build.sh" ]; then
    models+=("${name}")
  fi
done

printf '['
for i in "${!models[@]}"; do
  if [ "${i}" -gt 0 ]; then
    printf ','
  fi

  printf '{"name":"%s"}' "${models[${i}]}"
done
printf ']\n'
