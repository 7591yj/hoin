# hoin CLI

This archive contains a native `hoin` CLI build. Models are distributed as
separate release archives.

## Quick Start

1. Download and extract one or more `hoin-*-model-*.tar.gz` archives.
2. Move or copy the extracted `models/` directory next to this executable.
3. Open a terminal in this directory.
4. Run the executable with `--model-dir ./models/<model-name>`.

After setup, the directory should look like:

```text
.
├── @@BINARY_FILE@@
├── README.md
└── models/
    └── holo-hoin/
        ├── holo-hoin.onnx
        └── hoin-model.json
```

## Common Commands

```bash
./@@BINARY_FILE@@ help
./@@BINARY_FILE@@ model-info --model-dir ./models/holo-hoin
./@@BINARY_FILE@@ categorize --model-dir ./models/holo-hoin --dry-run .
./@@BINARY_FILE@@ categorize --model-dir ./models/holo-hoin --dry-run --ja . # use ja names
```

## Functions

- Classifies images with a selected model package.
- Routes files into model-defined destination folders.
- Can show the selected ONNX payloads.

## Notes

- **`categorize` modifies files** unless you pass `--dry-run`.
- `--ja` flag will fall back to en names if ja names are unavailable.
- Python is not required to run this release binary.
- Set `HOIN_MODEL_DIR` instead of passing `--model-dir` on every command.
- On Linux, the executable may still rely on normal system runtime libraries.
