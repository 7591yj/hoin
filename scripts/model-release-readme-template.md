# hoin model (@@MODEL_NAME@@)

This archive contains the `@@MODEL_NAME@@` model package for `hoin`.

## Quick Start

1. Extract this archive.
2. Move or copy the extracted `models/` directory next to a `hoin` CLI executable.
3. Open a terminal in the CLI directory.
4. Point the CLI at this model package with `--model-dir ./models/@@MODEL_NAME@@`.

After setup, the CLI directory should look like:

```text
.
├── hoin
├── README.md
└── models/
    └── @@MODEL_NAME@@/
        ├── @@MODEL_NAME@@.onnx
        └── hoin-model.json
```

## Common Commands

```bash
./hoin model-info --model-dir ./models/@@MODEL_NAME@@
./hoin categorize --model-dir ./models/@@MODEL_NAME@@ --dry-run /path/to/images
./hoin categorize --model-dir ./models/@@MODEL_NAME@@ --dry-run --ja /path/to/images
```

## Contents

- `models/@@MODEL_NAME@@/@@MODEL_NAME@@.onnx`
- `models/@@MODEL_NAME@@/hoin-model.json`
- Optional model sidecars, when produced by the model project.

## Notes

- This archive is OS-independent.
- Python is not required to use this model package with the release CLI.
- `--ja` falls back to en names if ja names are unavailable.
