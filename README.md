# hoin

Local web UI / CLI for image character classification

## Quick Start

Build the CLI in this repository or download a release binary, then run:

```bash
hoin help
hoin model-info --model-dir ./models/holo-hoin
hoin categorize --model-dir ./models/holo-hoin --dry-run <image-dir>
```

To run the local web UI from a source checkout:

```bash
just serve
```

For model-specific usage, see the README in `models/<name>/`.
Release artifacts ship with separate READMEs for CLI archives and model archives.

## Models

- [holo-hoin](models/holo-hoin/README.md): image classifier for identifying the
  Hololive character shown in an input image
- [molu-hoin](models/molu-hoin/README.md): image classifier for identifying the
  Blue Archive student shown in an input image

## Layout

- `apps/cli`: Rust CLI
- `apps/web`: Bun-powered local web UI
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

Common development commands:

```bash
just fmt
just lint
just check
just test
just smoke-web
just serve
```

## Model Contract

Each model lives under `models/<name>/` and _must_ provide:

- `models/<name>/build.sh`: the model-owned export script
- `models/<name>/<name>.onnx`: the required ONNX output produced by `build.sh`

Optional sidecar files such as `models/<name>/<name>.onnx.data` may also be produced
when a model uses ONNX external data.

The repository does not prescribe how `build.sh` works internally. It may use Python,
`uv`, PyTorch, or any other tooling, but the repo-level interface is the ONNX artifact.

Runtime inference happens inside the Rust CLI through ONNX Runtime. Python is only
a model-development/export concern and is not required by the release executable.
Release-visible model payloads are packaged as standalone model archives containing
the `*.onnx` file, a `hoin-model.json` manifest, and optional sidecars such as
`*.onnx.data`, `class_map.json`, or `config.json`.

CLI release artifacts are native binaries for a specific OS/architecture target.
They do not include model payloads. Download a CLI archive for the target OS and
one or more OS-independent model archives, then select a model with `--model-dir`
or `HOIN_MODEL_DIR`. The CLI may still rely on the target platform's normal system
runtime libraries and loader conventions (for example libc/libstdc++ on Linux,
system frameworks and loader rules on macOS, or the Windows runtime environment).

File routing is owned by Rust, not by the model runtime. `packages/metadata-schema`
registers per-model routing adapters that map classification results into destination
paths.

## Releases

Releases publish CLI archives, web UI archives, and model archives. The CLI and
web UI are built per OS/architecture target. Model archives are OS-independent
and can be used by any compatible CLI or web UI package.

CLI archives contain only the native `hoin` executable and release instructions.
Web UI archives contain a native `hoin-web` executable, the matching `hoin`
executable, browser assets, and release instructions. Model archives contain one
model package under `models/<name>/`.

If the repository contains:

- `models/a/`
- `models/b/`
- `models/c/`

then, the release automation will produce one model archive for `a`, one for `b`,
and one for `c`, plus OS-specific CLI and web UI archives.

For example, `models/test/build.sh` must produce
`models/test/test.onnx`, and the release model package will include
`models/test/test.onnx` plus a generated `models/test/hoin-model.json` manifest.

For both CLI and web UI release packages, download one or more model archives and
move or copy the extracted `models/` directory next to the release executable.
