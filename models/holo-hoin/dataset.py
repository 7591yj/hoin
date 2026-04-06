"""
Dataset & Augmentation Pipeline for Hololive Classifier
- 애니 이미지 특성 고려: 색조 변환 약하게
- Swin Transformer 입력 규격: 224x224
"""

import json
from pathlib import Path

import albumentations as A
import numpy as np
import torch
from albumentations.pytorch import ToTensorV2
from PIL import Image
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

# ──────────────────────────────────────────────
# Augmentation 정의
# ──────────────────────────────────────────────


def get_train_transforms(img_size: int = 224):
    """
    학습용 증강
    - 색조 변환은 약하게 (캐릭터 구분에 색상이 핵심)
    - 기하학적 변환 위주
    """
    return A.Compose(
        [
            A.RandomResizedCrop(size=(img_size, img_size), scale=(0.7, 1.0)),
            A.HorizontalFlip(p=0.5),
            A.Rotate(limit=15, p=0.3),
            A.OneOf(
                [
                    A.GaussianBlur(blur_limit=3, p=1.0),
                    A.MedianBlur(blur_limit=3, p=1.0),
                ],
                p=0.2,
            ),
            # 색조 변환: 아주 약하게
            A.HueSaturationValue(
                hue_shift_limit=5,  # 색조는 거의 안 건드림
                sat_shift_limit=20,  # 채도는 약간
                val_shift_limit=20,  # 밝기는 약간
                p=0.4,
            ),
            A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.4),
            A.CoarseDropout(
                num_holes_range=(1, 8),
                hole_height_range=(16, 32),
                hole_width_range=(16, 32),
                fill=0,
                p=0.3,
            ),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2(),
        ]
    )


def get_val_transforms(img_size: int = 224):
    """검증/테스트용: 리사이즈 + 정규화만"""
    return A.Compose(
        [
            A.Resize(img_size, img_size),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2(),
        ]
    )


# ──────────────────────────────────────────────
# Dataset
# ──────────────────────────────────────────────


class HoloDataset(Dataset):
    """
    dataset/raw/ 하위 폴더 구조를 읽어 클래스 자동 생성
    폴더 구조:
        dataset/raw/
            houshou_marine/  ← 클래스명 = 폴더명
            usada_pekora/
            others/
    """

    VALID_EXT = {".jpg", ".jpeg", ".png", ".webp"}

    def __init__(
        self,
        root_dir: str | Path,
        transform=None,
        split: str = "train",
        val_ratio: float = 0.1,
        test_ratio: float = 0.1,
        seed: int = 42,
    ):
        self.root_dir = Path(root_dir)
        self.transform = transform
        self.split = split

        # 클래스 목록 자동 생성 (폴더명 정렬)
        classes = sorted(
            [d.name for d in self.root_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
        )
        self.class_to_idx = {cls: i for i, cls in enumerate(classes)}
        self.idx_to_class = {i: cls for cls, i in self.class_to_idx.items()}
        self.classes = classes

        # 전체 샘플 수집
        all_samples = []
        for cls in classes:
            cls_dir = self.root_dir / cls
            for f in cls_dir.iterdir():
                if f.suffix.lower() in self.VALID_EXT:
                    all_samples.append((str(f), self.class_to_idx[cls]))

        # 재현 가능한 train/val/test split
        rng = np.random.default_rng(seed)
        indices = rng.permutation(len(all_samples))

        n_test = int(len(all_samples) * test_ratio)
        n_val = int(len(all_samples) * val_ratio)
        n_train = len(all_samples) - n_test - n_val

        if split == "train":
            split_indices = indices[:n_train]
        elif split == "val":
            split_indices = indices[n_train : n_train + n_val]
        else:  # test
            split_indices = indices[n_train + n_val :]

        self.samples = [all_samples[i] for i in split_indices]

        print(f"[{split}] {len(self.samples)}장 | {len(classes)}개 클래스")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        img = Image.open(img_path).convert("RGB")
        img = np.array(img)

        if self.transform:
            augmented = self.transform(image=img)
            img = augmented["image"]

        return img, label

    def get_class_weights(self) -> torch.Tensor:
        """클래스 불균형 보정용 가중치 계산"""
        class_counts = [0] * len(self.classes)
        for _, label in self.samples:
            class_counts[label] += 1

        weights = [1.0 / count if count > 0 else 0 for count in class_counts]
        sample_weights = [weights[label] for _, label in self.samples]
        return torch.tensor(sample_weights, dtype=torch.float)

    def save_class_map(self, save_path: str | Path):
        """클래스 매핑 저장 (API에서 사용)"""
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(self.idx_to_class, f, ensure_ascii=False, indent=2)
        print(f"클래스 맵 저장: {save_path}")


# ──────────────────────────────────────────────
# DataLoader 팩토리
# ──────────────────────────────────────────────


def build_dataloaders(
    root_dir: str | Path,
    img_size: int = 224,
    batch_size: int = 32,
    num_workers: int = 4,
    use_weighted_sampler: bool = True,
):
    """train/val/test DataLoader 한번에 생성"""
    train_ds = HoloDataset(root_dir, get_train_transforms(img_size), split="train")
    val_ds = HoloDataset(root_dir, get_val_transforms(img_size), split="val")
    test_ds = HoloDataset(root_dir, get_val_transforms(img_size), split="test")

    # 클래스 불균형 처리
    if use_weighted_sampler:
        sample_weights = train_ds.get_class_weights()
        sampler = WeightedRandomSampler(sample_weights, len(sample_weights))
        shuffle = False
    else:
        sampler = None
        shuffle = True

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        sampler=sampler,
        shuffle=shuffle,
        num_workers=num_workers,
        pin_memory=True,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
    )
    test_loader = DataLoader(
        test_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
    )

    return train_loader, val_loader, test_loader, train_ds
