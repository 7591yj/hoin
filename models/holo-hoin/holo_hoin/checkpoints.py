"""Checkpoint serialization helpers."""

import torch


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
