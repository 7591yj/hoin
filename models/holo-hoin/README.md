# holo-hoin

> Character names, group names, and related intellectual property used are owned
> by COVER Corp. and used here under the hololive production Derivative Works Guidelines.
>
> COVER Corp. does not relinquish its copyright or related rights.
>
> See the [terms](https://hololivepro.com/terms/)

Model-owned source and release artifacts for the `holo-hoin` model

## Contract

- `build.sh` is the only repository-level entry point for producing deployable artifacts
- `holo-hoin.onnx` is the release artifact and is a single-file ONNX
- `class_map.json` and `config.json` are optional sidecar artifacts shipped with
- Runtime serving belongs to the Rust CLI release path, not a Python API server

## Working Layout

- Core Python logic lives under `holo_hoin/`
- Root Python files are compatibility wrappers for the existing commands
- Local training checkpoints belong under `checkpoints/` (ignored by Git)
- `pyproject.toml` and `uv.lock` are the source of truth for Python dependencies
- `requirements.txt` is kept for pip compatibility only

## Common Tasks

```bash
./build.sh
uv run python export_onnx.py --checkpoint-dir ./checkpoints --output-dir .
uv run python eval_onnx.py
uv run python train.py --save-dir ./checkpoints
```

Equivalent module commands are also available:

```bash
uv run python -m holo_hoin.export_onnx --checkpoint-dir ./checkpoints --output-dir .
uv run python -m holo_hoin.eval_onnx
uv run python -m holo_hoin.train --save-dir ./checkpoints
```
