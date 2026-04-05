"""
추가학습 스크립트 — 기존 62클래스 모델 위에 새 데이터로 fine-tune
- class_map.json의 인덱스를 그대로 유지 (62클래스 출력 보존)
- 새 데이터에 있는 클래스만 loss 계산 (나머지 클래스 망각 방지)
- 매우 낮은 lr로 전체 fine-tune (catastrophic forgetting 최소화)
- Apple Silicon MPS 자동 지원
"""

import json
import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from PIL import Image
import albumentations as A
from albumentations.pytorch import ToTensorV2
import timm
from tqdm import tqdm


# ──────────────────────────────────────────────
# 디바이스
# ──────────────────────────────────────────────

def detect_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


# ──────────────────────────────────────────────
# 부분 클래스 Dataset (기존 class_map 인덱스 사용)
# ──────────────────────────────────────────────

VALID_EXT = {".jpg", ".jpeg", ".png", ".webp"}

def get_train_transforms(img_size=224):
    return A.Compose([
        A.RandomResizedCrop(size=(img_size, img_size), scale=(0.7, 1.0)),
        A.HorizontalFlip(p=0.5),
        A.Rotate(limit=15, p=0.3),
        A.OneOf([
            A.GaussianBlur(blur_limit=3, p=1.0),
            A.MedianBlur(blur_limit=3, p=1.0),
        ], p=0.2),
        A.HueSaturationValue(hue_shift_limit=5, sat_shift_limit=20, val_shift_limit=20, p=0.4),
        A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.4),
        A.CoarseDropout(num_holes_range=(1, 8), hole_height_range=(16, 32),
                        hole_width_range=(16, 32), fill=0, p=0.3),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ToTensorV2(),
    ])

def get_val_transforms(img_size=224):
    return A.Compose([
        A.Resize(img_size, img_size),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ToTensorV2(),
    ])


class PartialFinetuneDataset(Dataset):
    """
    data_dir 하위 폴더만 읽되, class_map.json의 인덱스를 그대로 사용.
    62클래스 모델의 출력 인덱스와 레이블이 일치하도록 보장.
    """
    def __init__(self, data_dir: Path, class_map: dict, transform=None,
                 split="train", val_ratio=0.1, test_ratio=0.1, seed=42):
        self.transform = transform
        # class_map: {idx_str: class_name} → 역방향 {class_name: idx}
        self.name_to_idx = {v: int(k) for k, v in class_map.items()}

        available = sorted([
            d.name for d in data_dir.iterdir()
            if d.is_dir() and not d.name.startswith(".")
            and d.name in self.name_to_idx
        ])

        all_samples = []
        for cls in available:
            cls_dir = data_dir / cls
            for f in cls_dir.iterdir():
                if f.suffix.lower() in VALID_EXT:
                    all_samples.append((str(f), self.name_to_idx[cls]))

        rng = np.random.default_rng(seed)
        indices = rng.permutation(len(all_samples))
        n_test  = int(len(all_samples) * test_ratio)
        n_val   = int(len(all_samples) * val_ratio)
        n_train = len(all_samples) - n_test - n_val

        if split == "train":
            split_indices = indices[:n_train]
        elif split == "val":
            split_indices = indices[n_train:n_train + n_val]
        else:
            split_indices = indices[n_train + n_val:]

        self.samples = [all_samples[i] for i in split_indices]
        self.active_classes = available
        print(f"[{split}] {len(self.samples)}장 | {len(available)}개 클래스")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        try:
            img = np.array(Image.open(img_path).convert("RGB"))
        except Exception:
            # 손상된 이미지 → 검은 이미지로 대체
            img = np.zeros((224, 224, 3), dtype=np.uint8)
        if self.transform:
            img = self.transform(image=img)["image"]
        return img, label

    def get_sample_weights(self):
        from collections import Counter
        counts = Counter(label for _, label in self.samples)
        weights = [1.0 / counts[label] for _, label in self.samples]
        return torch.tensor(weights, dtype=torch.float)


# ──────────────────────────────────────────────
# 학습 / 검증
# ──────────────────────────────────────────────

def train_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss, correct, total = 0.0, 0, 0
    for imgs, labels in tqdm(loader, desc="  train", leave=False):
        imgs, labels = imgs.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(imgs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * imgs.size(0)
        correct += (outputs.argmax(1) == labels).sum().item()
        total += imgs.size(0)
    return total_loss / total, correct / total


@torch.no_grad()
def val_epoch(model, loader, criterion, device):
    model.eval()
    total_loss, correct, total = 0.0, 0, 0
    for imgs, labels in tqdm(loader, desc="  val  ", leave=False):
        imgs, labels = imgs.to(device), labels.to(device)
        outputs = model(imgs)
        loss = criterion(outputs, labels)
        total_loss += loss.item() * imgs.size(0)
        correct += (outputs.argmax(1) == labels).sum().item()
        total += imgs.size(0)
    return total_loss / total, correct / total


# ──────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────

def main(args):
    device = detect_device()
    print(f"Device: {device}")

    save_dir = Path(args.save_dir)
    data_dir = Path(args.data_dir)

    # 기존 class_map 로드
    class_map_path = save_dir / "class_map.json"
    with open(class_map_path, encoding="utf-8") as f:
        class_map = json.load(f)  # {"0": "airani_iofifteen", ...}
    num_classes = len(class_map)
    print(f"기존 클래스 수: {num_classes}")

    # 데이터셋
    train_ds = PartialFinetuneDataset(data_dir, class_map, get_train_transforms(args.img_size),
                                      split="train")
    val_ds   = PartialFinetuneDataset(data_dir, class_map, get_val_transforms(args.img_size),
                                      split="val")
    print(f"fine-tune 대상 클래스: {train_ds.active_classes}")

    sample_weights = train_ds.get_sample_weights()
    sampler = WeightedRandomSampler(sample_weights, len(sample_weights))

    pin = device.type == "cuda"
    train_loader = DataLoader(train_ds, batch_size=args.batch_size,
                              sampler=sampler, num_workers=args.num_workers, pin_memory=pin)
    val_loader   = DataLoader(val_ds, batch_size=args.batch_size,
                              shuffle=False, num_workers=args.num_workers, pin_memory=pin)

    # 모델 로드 (62클래스 구조 그대로)
    model = timm.create_model("swin_tiny_patch4_window7_224",
                               pretrained=False, num_classes=num_classes)
    best_pth = save_dir / "holo-hoin.pth"
    model.load_state_dict(torch.load(best_pth, weights_only=True, map_location=device))
    model = model.to(device)
    print(f"모델 로드: {best_pth}")

    # Loss: 새 데이터에 없는 클래스는 loss 계산 제외
    # → weight=0 으로 무시 (기존 클래스 망각 최소화)
    active_indices = set(train_ds.name_to_idx[c] for c in train_ds.active_classes)
    class_weights = torch.zeros(num_classes)
    for idx in active_indices:
        class_weights[idx] = 1.0
    criterion = nn.CrossEntropyLoss(weight=class_weights.to(device), label_smoothing=0.1)

    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_val_acc = 0.0
    patience_counter = 0
    ft_best_pth = save_dir / "holo-hoin_ft.pth"

    print(f"\n{'─'*45}")
    print(f"Fine-tune 시작: {args.epochs} epochs | lr={args.lr}")
    print(f"{'─'*45}")

    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss,   val_acc   = val_epoch(model, val_loader, criterion, device)
        scheduler.step()

        print(f"  Epoch {epoch:2d}/{args.epochs} | "
              f"train_loss: {train_loss:.4f}  train_acc: {train_acc:.4f} | "
              f"val_loss: {val_loss:.4f}  val_acc: {val_acc:.4f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            torch.save(model.state_dict(), ft_best_pth)
            print(f"  → best 저장 ({ft_best_pth.name}, val_acc: {val_acc:.4f})")
        else:
            patience_counter += 1
            if args.patience > 0 and patience_counter >= args.patience:
                print(f"  Early stopping (patience={args.patience})")
                break

    print(f"\nFine-tune 완료! 최고 val_acc: {best_val_acc:.4f}")
    print(f"저장 위치: {ft_best_pth}")
    print(f"\n※ 전체 62클래스 추론에 사용하려면 holo-hoin.pth 를 교체하세요:")
    print(f"  cp {ft_best_pth} {save_dir}/holo-hoin.pth")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="기존 모델 위에 새 데이터로 추가학습")
    parser.add_argument("--data-dir",    default="./dataset/raw")
    parser.add_argument("--save-dir",    default="./checkpoints")
    parser.add_argument("--img-size",    type=int,   default=224)
    parser.add_argument("--batch-size",  type=int,   default=16,
                        help="M4 MPS 권장: 16")
    parser.add_argument("--num-workers", type=int,   default=4)
    parser.add_argument("--epochs",      type=int,   default=15)
    parser.add_argument("--lr",          type=float, default=2e-6,
                        help="매우 낮은 lr 권장 (catastrophic forgetting 방지)")
    parser.add_argument("--patience",    type=int,   default=5)
    main(parser.parse_args())
