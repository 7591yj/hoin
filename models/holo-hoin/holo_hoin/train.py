"""
Swin Transformer-Tiny 학습 스크립트
- Phase 1: Head만 학습 (5 epoch)
- Phase 2: 전체 fine-tune (낮은 lr)
- WandB 로깅 (선택)
- 최고 val_acc 모델 자동 저장
- Early stopping 지원
- Intel Arc GPU (XPU) 지원 — IPEX 설치 시 자동 활성화
"""

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import CosineAnnealingLR
from tqdm import tqdm

from .data import build_dataloaders
from .modeling import MODEL_NAME, build_classifier

try:
    import wandb

    WANDB_AVAILABLE = True
except ImportError:
    WANDB_AVAILABLE = False

try:
    import intel_extension_for_pytorch as ipex  # Intel Arc XPU 지원

    IPEX_AVAILABLE = True
except ImportError:
    IPEX_AVAILABLE = False


# ──────────────────────────────────────────────
# 디바이스 감지
# ──────────────────────────────────────────────


def detect_device(
    force_xpu: bool = False, force_cpu: bool = False, device_str: str = ""
) -> torch.device:
    """디바이스 우선순위: --device 명시 > --xpu > --cpu > xpu > cuda > mps > cpu"""
    if force_cpu:
        return torch.device("cpu")
    if device_str:
        return torch.device(device_str)
    if force_xpu:
        if IPEX_AVAILABLE and torch.xpu.is_available():
            return torch.device("xpu")
        raise RuntimeError(
            "--xpu 플래그를 지정했지만 Intel Arc XPU를 사용할 수 없습니다.\n"
            "  1) intel-extension-for-pytorch 설치: uv sync --extra arc\n"
            "  2) Intel GPU 드라이버 설치 확인"
        )
    if IPEX_AVAILABLE and torch.xpu.is_available():
        return torch.device("xpu")
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def make_scaler(device: torch.device, enabled: bool) -> torch.amp.GradScaler:
    """device-aware GradScaler 생성 (XPU / CUDA / CPU)"""
    dev_type = device.type
    if dev_type == "xpu":
        # IPEX XPU는 GradScaler를 직접 지원 (IPEX>=2.1)
        try:
            return torch.amp.GradScaler(dev_type, enabled=enabled)
        except Exception:
            return torch.amp.GradScaler("cpu", enabled=False)
    if dev_type == "cuda":
        return torch.amp.GradScaler("cuda", enabled=enabled)
    return torch.amp.GradScaler("cpu", enabled=False)


# ──────────────────────────────────────────────
# 모델
# ──────────────────────────────────────────────


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


# ──────────────────────────────────────────────
# 학습 루프
# ──────────────────────────────────────────────


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


# ──────────────────────────────────────────────
# 체크포인트
# ──────────────────────────────────────────────


def save_checkpoint(
    path, phase, epoch, model, optimizer, scheduler, scaler, best_val_acc, patience_counter
):
    torch.save(
        {
            "phase": phase,
            "epoch": epoch,
            "model_state": model.state_dict(),
            "optimizer_state": optimizer.state_dict(),
            "scheduler_state": scheduler.state_dict(),
            "scaler_state": scaler.state_dict(),
            "best_val_acc": best_val_acc,
            "patience_counter": patience_counter,
        },
        path,
    )


def load_checkpoint(path, device):
    return torch.load(path, weights_only=False, map_location=device)


# ──────────────────────────────────────────────
# 메인 학습
# ──────────────────────────────────────────────


def train(args):
    device = detect_device(
        force_xpu=args.xpu,
        force_cpu=args.cpu,
        device_str=args.device,
    )
    # AMP: CUDA/XPU만 활성화. MPS/CPU는 AMP 미지원
    use_amp = device.type in ("cuda", "xpu") and not args.no_amp
    print(
        f"Device: {device} | AMP: {use_amp}"
        + (" | IPEX" if (IPEX_AVAILABLE and device.type == "xpu") else "")
        + (" | Apple Silicon MPS" if device.type == "mps" else "")
    )

    # WandB 초기화
    use_wandb = args.wandb and WANDB_AVAILABLE
    if args.wandb and not WANDB_AVAILABLE:
        print("WandB 미설치: uv sync --extra logging 으로 설치 가능")
    if use_wandb:
        wandb.init(
            project=args.wandb_project,
            config=vars(args),
            name=args.wandb_run,
        )

    # 데이터로더
    train_loader, val_loader, test_loader, train_ds = build_dataloaders(
        root_dir=args.data_dir,
        img_size=args.img_size,
        batch_size=args.batch_size,
        num_workers=args.num_workers,
    )

    num_classes = len(train_ds.classes)
    print(f"클래스 수: {num_classes}")

    # 클래스 맵 저장
    save_dir = Path(args.save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)
    train_ds.save_class_map(save_dir / "class_map.json")

    # 모델
    model = build_model(num_classes).to(device)

    # Loss: Label Smoothing으로 과적합 방지
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    scaler = make_scaler(device, enabled=use_amp)

    # IPEX XPU 최적화 적용 여부 플래그
    _use_ipex = IPEX_AVAILABLE and device.type == "xpu"

    best_val_acc = 0.0
    patience_counter = 0
    resume_phase, resume_epoch = 1, 0
    ckpt = None

    # --finetune: holo-hoin.pth를 로드해 Phase 2부터 추가학습
    if args.finetune:
        best_pth = save_dir / "holo-hoin.pth"
        if not best_pth.exists():
            raise FileNotFoundError(f"--finetune 모드인데 {best_pth} 가 없습니다.")
        model.load_state_dict(torch.load(best_pth, weights_only=True, map_location=device))
        resume_phase = 2  # Phase 2(전체 fine-tune)부터 시작
        print(f"[finetune] {best_pth} 로드 완료 — Phase 2 추가학습 시작")

    # 체크포인트 로드 (--finetune 없을 때만)
    ckpt_path = save_dir / "checkpoint.pth"
    if not args.finetune and ckpt_path.exists():
        ckpt = load_checkpoint(ckpt_path, device)
        resume_phase = ckpt["phase"]
        resume_epoch = ckpt["epoch"]
        best_val_acc = ckpt["best_val_acc"]
        model.load_state_dict(ckpt["model_state"])
        print(
            f"체크포인트 로드: Phase {resume_phase}, "
            f"Epoch {resume_epoch}, best_val_acc={best_val_acc:.4f}"
        )
    elif not args.finetune:
        print("체크포인트 없음 — 처음부터 학습")

    # ────────────────────────────────
    # Phase 1: Head만 학습
    # ────────────────────────────────
    if resume_phase == 1:
        freeze_backbone(model)
        optimizer = optim.AdamW(
            filter(lambda p: p.requires_grad, model.parameters()), lr=1e-3, weight_decay=1e-4
        )
        scheduler = CosineAnnealingLR(optimizer, T_max=args.phase1_epochs)
        if _use_ipex:
            # AMP 대상 연산 dtype: bf16 (Arc 권장), fp16 (Arc A-Series 학습용)
            dtype = torch.bfloat16 if use_amp else torch.float32
            model, optimizer = ipex.optimize(model, optimizer=optimizer, dtype=dtype)

        if ckpt is not None and resume_phase == 1 and resume_epoch > 0:
            optimizer.load_state_dict(ckpt["optimizer_state"])
            scheduler.load_state_dict(ckpt["scheduler_state"])
            scaler.load_state_dict(ckpt["scaler_state"])
            patience_counter = ckpt["patience_counter"]

        p1_start = resume_epoch + 1
        if p1_start <= args.phase1_epochs:
            print(f"\n{'─' * 40}")
            print(f"Phase 1 시작 (epoch {p1_start}~{args.phase1_epochs})")
            print(f"{'─' * 40}")

        for epoch in range(p1_start, args.phase1_epochs + 1):
            train_loss, train_acc = train_epoch(
                model, train_loader, criterion, optimizer, device, scaler, use_amp
            )
            val_loss, val_acc = val_epoch(model, val_loader, criterion, device, use_amp)
            scheduler.step()

            print(
                f"  Epoch {epoch:2d}/{args.phase1_epochs} | "
                f"train_loss: {train_loss:.4f}  train_acc: {train_acc:.4f} | "
                f"val_loss: {val_loss:.4f}  val_acc: {val_acc:.4f}"
            )

            if use_wandb:
                wandb.log(
                    {
                        "phase": 1,
                        "epoch": epoch,
                        "train/loss": train_loss,
                        "train/acc": train_acc,
                        "val/loss": val_loss,
                        "val/acc": val_acc,
                        "lr": scheduler.get_last_lr()[0],
                    }
                )

            if val_acc > best_val_acc:
                best_val_acc = val_acc
                patience_counter = 0
                torch.save(model.state_dict(), save_dir / "holo-hoin.pth")
                print(f"  → best 저장 (val_acc: {val_acc:.4f})")
            else:
                patience_counter += 1

            save_checkpoint(
                ckpt_path,
                1,
                epoch,
                model,
                optimizer,
                scheduler,
                scaler,
                best_val_acc,
                patience_counter,
            )

    # ────────────────────────────────
    # Phase 2: 전체 fine-tune
    # ────────────────────────────────
    unfreeze_all(model)

    optimizer = optim.AdamW(model.parameters(), lr=args.phase2_lr, weight_decay=1e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.phase2_epochs)
    if _use_ipex:
        dtype = torch.bfloat16 if use_amp else torch.float32
        model, optimizer = ipex.optimize(model, optimizer=optimizer, dtype=dtype)

    p2_start = 1
    if resume_phase == 2:
        patience_counter = ckpt["patience_counter"]
        optimizer.load_state_dict(ckpt["optimizer_state"])
        scheduler.load_state_dict(ckpt["scheduler_state"])
        if ckpt.get("scaler_state"):
            scaler.load_state_dict(ckpt["scaler_state"])
        p2_start = resume_epoch + 1
    else:
        patience_counter = 0  # Phase 2 새로 시작 시 리셋

    if p2_start <= args.phase2_epochs:
        print(f"\n{'─' * 40}")
        print(f"Phase 2 시작 (epoch {p2_start}~{args.phase2_epochs}, patience={args.patience})")
        print(f"{'─' * 40}")

    for epoch in range(p2_start, args.phase2_epochs + 1):
        train_loss, train_acc = train_epoch(
            model, train_loader, criterion, optimizer, device, scaler, use_amp
        )
        val_loss, val_acc = val_epoch(model, val_loader, criterion, device, use_amp)
        scheduler.step()

        print(
            f"  Epoch {epoch:2d}/{args.phase2_epochs} | "
            f"train_loss: {train_loss:.4f}  train_acc: {train_acc:.4f} | "
            f"val_loss: {val_loss:.4f}  val_acc: {val_acc:.4f}"
        )

        if use_wandb:
            wandb.log(
                {
                    "phase": 2,
                    "epoch": args.phase1_epochs + epoch,
                    "train/loss": train_loss,
                    "train/acc": train_acc,
                    "val/loss": val_loss,
                    "val/acc": val_acc,
                    "lr": scheduler.get_last_lr()[0],
                }
            )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            torch.save(model.state_dict(), save_dir / "holo-hoin.pth")
            print(f"  → best 저장 (val_acc: {val_acc:.4f})")
        else:
            patience_counter += 1
            if args.patience > 0 and patience_counter >= args.patience:
                print(f"  Early stopping (patience={args.patience})")
                break

        save_checkpoint(
            ckpt_path, 2, epoch, model, optimizer, scheduler, scaler, best_val_acc, patience_counter
        )

    # ────────────────────────────────
    # 최종 테스트
    # ────────────────────────────────
    print(f"\n{'─' * 40}")
    print("테스트 세트 평가")
    model.load_state_dict(torch.load(save_dir / "holo-hoin.pth", weights_only=True))
    test_loss, test_acc, per_class_acc = test_epoch(
        model, test_loader, criterion, device, use_amp, num_classes
    )
    print(f"  test_loss: {test_loss:.4f}  test_acc: {test_acc:.4f}")

    # 정확도 낮은 클래스 출력 (디버깅용)
    low_acc_classes = sorted(
        [(train_ds.idx_to_class[i], acc) for i, acc in per_class_acc.items()], key=lambda x: x[1]
    )[:10]
    print("  [하위 10개 클래스]")
    for cls_name, acc in low_acc_classes:
        print(f"    {cls_name}: {acc:.4f}")
    print(f"{'─' * 40}\n")

    if use_wandb:
        wandb.log({"test/loss": test_loss, "test/acc": test_acc})
        wandb.finish()

    # 학습 설정 저장
    config = {
        "num_classes": num_classes,
        "img_size": args.img_size,
        "best_val_acc": best_val_acc,
        "test_acc": test_acc,
        "model": MODEL_NAME,
    }
    with open(save_dir / "config.json", "w") as f:
        json.dump(config, f, indent=2)

    print(f"학습 완료! 최고 val_acc: {best_val_acc:.4f}")
    print(f"모델 저장 위치: {save_dir}/holo-hoin.pth")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="./dataset/raw")
    parser.add_argument("--save-dir", default="./checkpoints")
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--phase1-epochs", type=int, default=5)
    parser.add_argument("--phase2-epochs", type=int, default=30)
    parser.add_argument("--phase2-lr", type=float, default=1e-5)
    # ── 디바이스 옵션 ──────────────────────────────────
    parser.add_argument(
        "--xpu", action="store_true", help="Intel Arc GPU(XPU) 강제 사용 (IPEX 필요)"
    )
    parser.add_argument("--cpu", action="store_true", help="CPU 강제 사용")
    parser.add_argument("--device", default="", help="디바이스 직접 지정 (예: xpu, xpu:0, cuda:1)")
    parser.add_argument("--no-amp", action="store_true", help="AMP(mixed precision) 비활성화")
    # ── 학습 옵션 ──────────────────────────────────────
    parser.add_argument(
        "--finetune",
        action="store_true",
        help="holo-hoin.pth 로드 후 Phase 2 추가학습 (새 데이터 추가 시)",
    )
    parser.add_argument(
        "--patience", type=int, default=7, help="Early stopping patience (0=비활성화)"
    )
    parser.add_argument("--wandb", action="store_true", help="WandB 로깅 활성화")
    parser.add_argument("--wandb-project", default="holoscope")
    parser.add_argument("--wandb-run", default=None)
    args = parser.parse_args()

    train(args)


if __name__ == "__main__":
    main()
