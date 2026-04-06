"""
FP16 경량화 + 성능 비교 스크립트

지원 디바이스:
  - Mac  : MPS  (Apple Silicon, FP16 네이티브 지원)
  - NVIDIA: CUDA (FP16 네이티브 지원)
  - 기타  : CPU  (변환만 수행, 벤치마크 스킵)

Usage:
  uv run python quantize_fp16.py
  uv run python quantize_fp16.py --data-dir ./dataset/raw --batch-size 64
"""

import argparse
import json
import os
import time
from pathlib import Path

import timm
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm

from dataset import HoloDataset, get_val_transforms

CHECKPOINT_DIR = Path("checkpoints")
FP32_PATH = CHECKPOINT_DIR / "holo-hoin.pth"
FP16_PATH = CHECKPOINT_DIR / "holo-hoin_fp16.pth"
CLASS_MAP_PATH = CHECKPOINT_DIR / "class_map.json"


def get_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def load_model(weights_path: Path, num_classes: int, device: torch.device) -> nn.Module:
    model = timm.create_model(
        "swin_tiny_patch4_window7_224",
        pretrained=False,
        num_classes=num_classes,
    )
    state_dict = torch.load(weights_path, map_location="cpu", weights_only=True)
    model.load_state_dict(state_dict)
    return model.to(device).eval()


@torch.no_grad()
def evaluate(
    model: nn.Module, loader: DataLoader, device: torch.device, dtype: torch.dtype
) -> tuple[float, float]:
    correct = total = 0
    t0 = time.time()
    for imgs, labels in tqdm(loader, desc=f"  eval ({dtype})", leave=False):
        imgs = imgs.to(device=device, dtype=dtype)
        labels = labels.to(device)
        logits = model(imgs)
        preds = logits.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)
    return correct / total, time.time() - t0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="dataset/raw")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--num-workers", type=int, default=4)
    args = parser.parse_args()

    device = get_device()
    print(f"디바이스: {device}")

    with open(CLASS_MAP_PATH) as f:
        num_classes = len(json.load(f))
    print(f"클래스 수: {num_classes}")

    # ── test dataloader ──────────────────────────
    test_ds = HoloDataset(args.data_dir, get_val_transforms(), split="test")
    test_loader = DataLoader(
        test_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
    )

    can_benchmark = device.type in ("cuda", "mps")
    if not can_benchmark:
        print("\nCPU 환경: 변환만 수행합니다 (벤치마크는 CUDA/MPS에서 실행하세요)\n")

    # ── FP32 평가 ────────────────────────────────
    print("[1/3] FP32 모델 로드...")
    model_fp32 = load_model(FP32_PATH, num_classes, device)

    if can_benchmark:
        print("      FP32 평가 중...")
        acc_fp32, t_fp32 = evaluate(model_fp32, test_loader, device, torch.float32)
        print(f"  FP32 test_acc: {acc_fp32 * 100:.2f}%  |  {t_fp32:.1f}s")

    # ── FP16 변환 + 저장 ─────────────────────────
    print("\n[2/3] FP16 변환 및 저장...")
    fp16_state = {k: v.half() for k, v in model_fp32.state_dict().items()}
    torch.save(fp16_state, FP16_PATH)

    fp32_mb = os.path.getsize(FP32_PATH) / 1024**2
    fp16_mb = os.path.getsize(FP16_PATH) / 1024**2
    print(f"  FP32: {fp32_mb:.1f} MB  →  FP16: {fp16_mb:.1f} MB  ({fp16_mb / fp32_mb * 100:.0f}%)")

    # ── FP16 평가 ────────────────────────────────
    if can_benchmark:
        print("\n[3/3] FP16 모델 로드 및 평가...")
        model_fp16 = load_model(FP16_PATH, num_classes, device)
        # MPS/CUDA 모두 half() 로 올려야 FP16 연산
        model_fp16 = model_fp16.half()
        acc_fp16, t_fp16 = evaluate(model_fp16, test_loader, device, torch.float16)
        print(f"  FP16 test_acc: {acc_fp16 * 100:.2f}%  |  {t_fp16:.1f}s")

        delta_acc = (acc_fp16 - acc_fp32) * 100
        delta_t = t_fp16 - t_fp32
        print("\n" + "=" * 50)
        print(f"{'':6}{'FP32':>12}{'FP16':>12}{'차이':>10}")
        print("-" * 50)
        print(f"{'파일크기':6}{fp32_mb:>10.1f}MB{fp16_mb:>10.1f}MB{fp16_mb - fp32_mb:>+8.1f}MB")
        print(f"{'Test Acc':6}{acc_fp32 * 100:>11.2f}%{acc_fp16 * 100:>11.2f}%{delta_acc:>+9.2f}pp")
        print(f"{'추론시간':6}{t_fp32:>10.1f}s{t_fp16:>10.1f}s{delta_t:>+8.1f}s")
        print("=" * 50)
    else:
        print("\n변환 결과:")
        print(f"  FP32: {fp32_mb:.1f} MB  →  FP16: {fp16_mb:.1f} MB")
        print("  성능 비교는 Mac(MPS) 또는 CUDA 환경에서 실행하세요.")

    print(f"\nFP16 저장 완료: {FP16_PATH}")


if __name__ == "__main__":
    main()
