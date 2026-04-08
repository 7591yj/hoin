"""Reusable training, validation, and test loops."""

import torch
from tqdm import tqdm


def train_epoch(model, loader, criterion, optimizer, device, scaler, use_amp):
    model.train()
    total_loss, correct, total = 0.0, 0, 0

    for imgs, labels in tqdm(loader, desc="  train", leave=False):
        imgs, labels = imgs.to(device), labels.to(device)
        optimizer.zero_grad()

        with torch.amp.autocast(device_type=device.type, enabled=use_amp):
            outputs = model(imgs)
            loss = criterion(outputs, labels)

        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()

        total_loss += loss.item() * imgs.size(0)
        correct += (outputs.argmax(1) == labels).sum().item()
        total += imgs.size(0)

    return total_loss / total, correct / total


@torch.no_grad()
def val_epoch(model, loader, criterion, device, use_amp):
    model.eval()
    total_loss, correct, total = 0.0, 0, 0

    for imgs, labels in tqdm(loader, desc="  val", leave=False):
        imgs, labels = imgs.to(device), labels.to(device)

        with torch.amp.autocast(device_type=device.type, enabled=use_amp):
            outputs = model(imgs)
            loss = criterion(outputs, labels)

        total_loss += loss.item() * imgs.size(0)
        correct += (outputs.argmax(1) == labels).sum().item()
        total += imgs.size(0)

    return total_loss / total, correct / total


@torch.no_grad()
def test_epoch(model, loader, criterion, device, use_amp, num_classes: int):
    """테스트: 전체 정확도 + 클래스별 정확도"""
    model.eval()
    total_loss, correct, total = 0.0, 0, 0
    class_correct = [0] * num_classes
    class_total = [0] * num_classes

    for imgs, labels in tqdm(loader, desc="  test", leave=False):
        imgs, labels = imgs.to(device), labels.to(device)

        with torch.amp.autocast(device_type=device.type, enabled=use_amp):
            outputs = model(imgs)
            loss = criterion(outputs, labels)

        preds = outputs.argmax(1)
        total_loss += loss.item() * imgs.size(0)
        correct += (preds == labels).sum().item()
        total += imgs.size(0)

        for pred, label in zip(preds.cpu(), labels.cpu()):
            class_total[label] += 1
            if pred == label:
                class_correct[label] += 1

    per_class_acc = {
        i: class_correct[i] / class_total[i] for i in range(num_classes) if class_total[i] > 0
    }
    return total_loss / total, correct / total, per_class_acc
