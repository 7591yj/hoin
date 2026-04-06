# hoin (@@MODEL_NAME@@)

This archive contains build of `hoin` with the `@@MODEL_NAME@@` model.

## Quick Start

1. Open a terminal in this directory.
2. Run the executable with the `help` command to see usage and examples.
3. Point the CLI at a directory of images to classify.

## Common Commands

```bash
./@@BINARY_FILE@@ help
./@@BINARY_FILE@@ model-info
./@@BINARY_FILE@@ categorize --dry-run .
./@@BINARY_FILE@@ categorize --dry-run --ja . # use ja names
./@@BINARY_FILE@@ extract-model --output-dir ./extracted-model
```

## Functions

- Classifies images with the embedded `@@MODEL_NAME@@` model.
- Routes files into model-defined destination folders.
- Can show or extract the embedded model artifacts.

## Notes

- **`categorize` modifies files** unless you pass `--dry-run`.
- `--ja` flag will fall back to en names if ja names are unavailable.
