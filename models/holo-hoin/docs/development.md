# holo-hoin development guide

This directory owns the Python model-development workflow for `holo-hoin`.
Release packaging and runtime serving live outside this Python project.

## Layout

- `holo_hoin/`: importable package with training, export, evaluation, and shared
  model code.
- `*.py` at the project root: compatibility wrappers for existing CLI commands.
- `build.sh`: repository-level artifact build entry point.
- `tools/`: local development helpers that are not part of the runtime contract.
- `checkpoints/`: local training outputs, ignored by Git.
- `holo-hoin.onnx`: checked-in release artifact used by the Rust release path.
- `class_map.json` and `config.json`: sidecar metadata copied from checkpoints
  when present.

## Commands

Run commands from `models/holo-hoin` unless a command states otherwise.

```bash
uv sync
uv run python train.py --save-dir ./checkpoints
uv run python export_onnx.py --checkpoint-dir ./checkpoints --output-dir .
uv run python eval_onnx.py
uv run python eval_onnx.py --data-dir ./dataset/raw
./build.sh
```

Module entry points are equivalent and preferred for new automation:

```bash
uv run python -m holo_hoin.train --save-dir ./checkpoints
uv run python -m holo_hoin.export_onnx --checkpoint-dir ./checkpoints --output-dir .
uv run python -m holo_hoin.eval_onnx
```

## Hardware-specific setup

Default development uses the standard `uv sync` environment.

Intel Arc training requires the optional `arc` extra:

```bash
uv sync --extra arc
uv run python train.py --xpu --save-dir ./checkpoints
```

Notes:

- Intel Arc support is wired through `intel-extension-for-pytorch` and `oneccl-bind-pt`.
- Python 3.14 is excluded for the `arc` extra because the required IPEX wheels
  are not published for it.
- `--xpu` forces Intel XPU selection. Without it, device selection falls back
  automatically through `xpu`, `cuda`, `mps`, then `cpu`.
- If XPU is requested but unavailable, verify both the extra install and runtime
  availability of `torch.xpu`.

ROCm ONNX validation is a separate environment concern:

```bash
pip install onnxruntime-rocm
```

Do not install `onnxruntime-rocm` alongside the default `onnxruntime` package in
the same environment because they conflict.

## Local tools

Monitor an active training log:

```bash
./tools/monitor_training.sh
./tools/monitor_training.sh ./train_cpu.log
```

The monitor reads checkpoints from `./checkpoints` and defaults to
`./train_cpu.log` in this project directory.

## Artifact contract

`build.sh` exports `holo-hoin.onnx` from `checkpoints/holo-hoin.pth` and keeps
the model in single-file ONNX mode by deleting `holo-hoin.onnx.data`. If the
checkpoint inputs are missing but `holo-hoin.onnx` already exists, the script
treats the checked-in artifact as the source of truth and exits successfully.
