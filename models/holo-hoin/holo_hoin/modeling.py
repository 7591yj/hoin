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
