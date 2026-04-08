"""Shared model construction helpers."""

import timm
import torch.nn as nn

MODEL_NAME = "swin_tiny_patch4_window7_224"


def build_classifier(num_classes: int, pretrained: bool = False) -> nn.Module:
    return timm.create_model(
        MODEL_NAME,
        pretrained=pretrained,
        num_classes=num_classes,
    )


def build_model(num_classes: int, pretrained: bool = True) -> nn.Module:
    return build_classifier(num_classes=num_classes, pretrained=pretrained)


def freeze_backbone(model: nn.Module):
    """head만 학습 (Phase 1)"""
    for name, param in model.named_parameters():
        if "head" not in name:
            param.requires_grad = False
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Phase 1: head만 학습 | 학습 파라미터: {trainable:,}")


def unfreeze_all(model: nn.Module):
    """전체 학습 (Phase 2)"""
    for param in model.parameters():
        param.requires_grad = True
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Phase 2: 전체 fine-tune | 학습 파라미터: {trainable:,}")
