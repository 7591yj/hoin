# hoin

Cross-platform CLI for one-shot image character classification

## Quick Start

Build the CLI in this repository or download a release binary, then run:

```bash
hoin help
hoin model-info
hoin categorize --dry-run <image-dir>
```

For model-specific usage, see the README in `models/<name>/`. Release artifacts ship
with a separate README focused on binary usage.

## Models

- [holo-hoin](models/holo-hoin/README.md): image classifier for identifying the
  Hololive character shown in an input image

## Layout

- `apps/cli`: Rust CLI
- `packages/metadata-schema`: shared Rust types for metadata contracts
- `models/`: model projects that export deployable ONNX artifacts
- `scripts/build-models.sh`: validates the model export contract across `models/*`

## Development

On Nix-enabled machines:

```bash
nix develop
just build-models
just check
just test
```

Without Nix, install stable Rust and `just`, then run the same `just` targets.

## Model Contract

Each model lives under `models/<name>/` and _must_ provide:

- `models/<name>/build.sh`: the model-owned export script
- `models/<name>/<name>.onnx`: the required ONNX output produced by `build.sh`
- `models/<name>/main.py`: a Python entrypoint with `predict_for_cli(path) -> dict`

Optional sidecar files such as `models/<name>/<name>.onnx.data`, `class_map.json`,
and `config.json` may also be produced and shipped with the release artifact.

The repository does not prescribe how `build.sh` works internally. It may use Python,
`uv`, PyTorch, or any other tooling, but the repo-level interface is the ONNX artifact.

The CLI-facing prediction contract is model-agnostic and lives at the Python boundary.
`predict_for_cli(path)` must return JSON-serializable data with:

- `class_key`: model-defined predicted label key
- `confidence`: model-defined confidence score

File routing is owned by Rust, not by the model runtime. `packages/metadata-schema`
registers per-model routing adapters that map classification results into destination
paths.

## Releases

Each release executable embeds exactly one model.

If the repository contains:

- `models/a/`
- `models/b/`
- `models/c/`

then, the release automation will produce separate binaries for `a`, `b`, and `c`.
The selected model is chosen at compile time, and the resulting executable includes
only that model's artifacts.

For example, `models/test/build.sh` must produce
`models/test/test.onnx`, and the resulting binary embeds `test` rather than
every model in the repository.
