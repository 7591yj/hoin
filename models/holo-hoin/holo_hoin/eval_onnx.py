"""ONNX smoke and held-out test evaluation for holo-hoin artifacts."""

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tqdm import tqdm


def load_class_map(path: Path) -> dict[int, str]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


def load_session(onnx_path: Path) -> ort.InferenceSession:
    return ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])


def run_smoke(session: ort.InferenceSession, img_size: int) -> np.ndarray:
    dummy = np.zeros((1, 3, img_size, img_size), dtype=np.float32)
    logits = session.run(["logits"], {"input": dummy})[0]
    if logits.ndim != 2 or logits.shape[0] != 1:
        raise RuntimeError(f"Unexpected logits shape: {logits.shape}")
    if not np.isfinite(logits).all():
        raise RuntimeError("ONNX output contains NaN or Inf")
    return logits


def evaluate_test_split(
    session: ort.InferenceSession,
    data_dir: str | Path,
    img_size: int,
    num_classes: int,
) -> tuple[float, dict[int, float]]:
    from .data import HoloDataset, get_val_transforms

    dataset = HoloDataset(data_dir, get_val_transforms(img_size), split="test")
    correct = 0
    total = 0
    class_correct = [0] * num_classes
    class_total = [0] * num_classes

    for image, label in tqdm(dataset, desc="  onnx test", leave=False):
        inp = image.numpy()[np.newaxis].astype(np.float32)
        logits = session.run(["logits"], {"input": inp})[0][0]
        pred = int(logits.argmax())

        total += 1
        correct += pred == label
        class_total[label] += 1
        if pred == label:
            class_correct[label] += 1

    if total == 0:
        raise RuntimeError("No samples found in the test split")

    per_class_acc = {
        idx: class_correct[idx] / class_total[idx]
        for idx in range(num_classes)
        if class_total[idx] > 0
    }
    return correct / total, per_class_acc


def evaluate(args):
    onnx_path = Path(args.onnx)
    class_map_path = Path(args.class_map)
    class_map = load_class_map(class_map_path)
    session = load_session(onnx_path)

    logits = run_smoke(session, args.img_size)
    expected_classes = len(class_map)
    if logits.shape[1] != expected_classes:
        raise RuntimeError(
            f"Class count mismatch: ONNX logits={logits.shape[1]}, class_map={expected_classes}"
        )

    print(f"ONNX smoke OK: {onnx_path} | classes={expected_classes}")

    if args.data_dir:
        test_acc, per_class_acc = evaluate_test_split(
            session,
            args.data_dir,
            args.img_size,
            expected_classes,
        )
        print(f"ONNX test_acc: {test_acc:.4f}")

        low_acc_classes = sorted(
            [(class_map[idx], acc) for idx, acc in per_class_acc.items()],
            key=lambda item: item[1],
        )[: args.lowest_classes]
        if low_acc_classes:
            print(f"[Lowest {len(low_acc_classes)} classes]")
            for class_name, acc in low_acc_classes:
                print(f"  {class_name}: {acc:.4f}")


def main():
    parser = argparse.ArgumentParser(description="Smoke/evaluate holo-hoin ONNX artifact")
    parser.add_argument("--onnx", default="./holo-hoin.onnx", help="Path to exported ONNX model")
    parser.add_argument("--class-map", default="./class_map.json", help="Path to class_map.json")
    parser.add_argument("--data-dir", default="", help="Optional dataset root for test-split eval")
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--lowest-classes", type=int, default=10)
    args = parser.parse_args()
    evaluate(args)


if __name__ == "__main__":
    main()
