#!/usr/bin/env bash

set -euo pipefail

artifact_dir="${1:?artifact directory is required}"
binary_file="${2:?binary file name is required}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template_path="${script_dir}/release-readme-template.md"

python - "$template_path" "$artifact_dir/README.md" "$binary_file" <<'PY'
from pathlib import Path
import sys

template_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
binary_file = sys.argv[3]

contents = template_path.read_text()
contents = contents.replace("@@BINARY_FILE@@", binary_file)
output_path.write_text(contents)
PY
