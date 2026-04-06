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

## Working Layout

- Python source and helper scripts live at the directory root
- Local training checkpoints belong under `checkpoints/` (ignored by Git)

## Common Tasks

```bash
./build.sh
uv run python export_onnx.py --checkpoint-dir ./checkpoints --output-dir .
uv run python train.py --save-dir ./checkpoints
```
