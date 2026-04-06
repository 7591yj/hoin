# hoin

Cross-platform CLI for one-shot image character classification

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

Optional sidecar files such as `models/<name>/<name>.onnx.data`, `class_map.json`,
and `config.json` may also be produced and shipped with the release artifact.

The repository does not prescribe how `build.sh` works internally. It may use Python,
`uv`, PyTorch, or any other tooling, but the repo-level interface is the ONNX artifact.

Runtime inference happens inside the Rust CLI through ONNX Runtime. Python is only
a model-development/export concern and is not required by the release executable.

Release artifacts are native binaries for a specific OS/architecture target. Each
binary embeds its selected model and does not require a Python runtime or external
model files at execution time, but it may still rely on the target platform's normal
system runtime libraries and loader conventions (for example libc/libstdc++ on Linux,
system frameworks and loader rules on macOS, or the Windows runtime environment).

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
