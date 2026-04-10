#!/usr/bin/env bash

set -euo pipefail

artifact_dir="${1:?artifact directory is required}"
web_binary_file="${2:?web binary file name is required}"
cli_binary_file="${3:?CLI binary file name is required}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template_path="${script_dir}/web-release-readme-template.md"

python - "$template_path" "$artifact_dir/README.md" "$web_binary_file" "$cli_binary_file" <<'PY'
from pathlib import Path
import sys

template_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
web_binary_file = sys.argv[3]
cli_binary_file = sys.argv[4]

contents = template_path.read_text()
contents = contents.replace("@@WEB_BINARY_FILE@@", web_binary_file)
contents = contents.replace("@@CLI_BINARY_FILE@@", cli_binary_file)
output_path.write_text(contents)
PY
