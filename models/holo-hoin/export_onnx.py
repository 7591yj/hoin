"""
holo-hoin.pth → holo-hoin.onnx 변환 스크립트

사용법:
    uv run python export_onnx.py
    uv run python export_onnx.py --checkpoint-dir ./checkpoints --opset 17
    uv run python export_onnx.py --checkpoint-dir ./checkpoints --output-dir .
"""

import argparse
import json
from pathlib import Path

import numpy as np
import timm
import torch


def export(args):
    ckpt_dir = Path(args.checkpoint_dir)
    output_dir = Path(args.output_dir)
    model_path = ckpt_dir / "holo-hoin.pth"
    class_map_path = ckpt_dir / "class_map.json"
    out_path = output_dir / "holo-hoin.onnx"
    sidecar_path = output_dir / "holo-hoin.onnx.data"

    output_dir.mkdir(parents=True, exist_ok=True)

    if out_path.exists():
        out_path.unlink()
    if sidecar_path.exists():
        sidecar_path.unlink()

    with open(class_map_path, encoding="utf-8") as f:
        num_classes = len(json.load(f))

    print(f"클래스 수: {num_classes}")

    model = timm.create_model(
        "swin_tiny_patch4_window7_224",
        pretrained=False,
        num_classes=num_classes,
    )
    model.load_state_dict(torch.load(model_path, map_location="cpu", weights_only=True))
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)

    print(f"ONNX 변환 중 (opset={args.opset}) ...")
    torch.onnx.export(
        model,
        dummy,
        str(out_path),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=args.opset,
    )

    print(f"저장 완료: {out_path}")

    # onnxruntime으로 수치 검증
    try:
        import onnxruntime as ort

        sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
        ort_out = sess.run(["logits"], {"input": dummy.numpy()})[0]

        with torch.no_grad():
            ref = model(dummy).numpy()

        max_diff = float(np.abs(ort_out - ref).max())
        print(f"수치 검증: max_diff={max_diff:.2e}", end="  ")
        print("OK" if max_diff < 1e-3 else "경고: 오차 큼, opset 확인 필요")
    except ImportError:
        print("onnxruntime 미설치 — 검증 건너뜀 (uv sync 후 재실행)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Swin-T → ONNX 변환")
    parser.add_argument("--checkpoint-dir", default="./checkpoints")
    parser.add_argument("--output-dir", default="./checkpoints")
    parser.add_argument("--opset", type=int, default=18)
    args = parser.parse_args()
    export(args)
