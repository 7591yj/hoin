# molu-hoin

> Character names, school names, and related intellectual property used are
> owned by NEXON / Yostar / NAT GAMES; this project uses them as fan reference
> material for image classification only.

Model-owned source and release artifacts for the `molu-hoin` model — an image
classifier for identifying the Blue Archive student shown in an input image.

## Contract

- `build.sh` is the only repository-level entry point for producing deployable artifacts
- `molu-hoin.onnx` is the release artifact and is a single-file ONNX
- `class_map.json` and `config.json` are optional sidecar artifacts shipped with
  the model package

## Working Layout

- Local training checkpoints belong under `checkpoints/` (ignored by Git)
- Python training/export sources are not yet included in the repository; the
  current `build.sh` will reuse the committed `molu-hoin.onnx` artifact when
  `checkpoints/` is empty

## Common Tasks

```bash
./build.sh
```
