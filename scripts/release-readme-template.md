# hoin CLI

This archive contains a native `hoin` CLI build. Models are distributed as
separate release archives.

## Quick Start

1. Open a terminal in this directory.
2. Download and extract a `hoin-*-model-*.tar.gz` archive.
3. Run the executable with `--model-dir` pointing at the extracted model package.

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
