# hoin-cli

CLI for one-shot image character classification.

## Functions

- Classifies images under a target directory and routes them into character folders.
- Supports dry-run previews, JSON output, and confidence threshold filtering.
- Supports Japanese character names when the selected model package provides them.
- Prints the selected model name and ONNX artifacts for debugging package resolution.

## Commands

```sh
hoin
hoin categorize [PATH]
hoin help
hoin model-info
```

## Notes

- Running without a subcommand behaves like `hoin categorize .`.
- Model packages are selected with `--model-dir`, `HOIN_MODEL_DIR`, or a single
  package under `./models`.
- `model-info` resolves the same package selection flow as `categorize`.
- `categorize --json` emits moves, skipped entries, already-categorized files,
  failures, and a summary object.
- `categorize --dry-run` prints planned moves without modifying files.
- `categorize --ja` switches routing names to Japanese when the selected metadata
  supports it.

## Restrictions

- `--min-confidence` must be between `0.0` and `1.0`.
- If multiple model packages exist under `./models`, you must pass `--model-dir`
  or set `HOIN_MODEL_DIR`.
