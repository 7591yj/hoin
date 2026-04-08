# holo-hoin ONNX evaluation

`eval_onnx.py` validates the release-style ONNX artifact path. It does not load
PyTorch checkpoints and it does not expect images under `checkpoints/`.

## Smoke check

Smoke-check the exported artifact and class map:

```bash
uv run python eval_onnx.py
```

Default inputs are:

- `--onnx ./holo-hoin.onnx`
- `--class-map ./class_map.json`

## Held-out test split

Evaluate the held-out test split when a local image dataset is available:

```bash
uv run python eval_onnx.py --data-dir ./dataset/raw
```

`--data-dir` must point to the image dataset root. The loader expects class-named
subdirectories, not loose images:

```text
dataset/raw/
  amane_kanata/
    image-001.jpg
  yukihana_lamy/
    image-001.webp
  others/
    image-001.png
```

Expected output:

```text
ONNX smoke OK: holo-hoin.onnx | classes=62
[test] 1000장 | 62개 클래스
ONNX test_acc: 0.8730
[Lowest 10 classes]
  some_class: 0.5123
```
