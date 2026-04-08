"""Compatibility wrapper for the partial fine-tuning CLI."""

from holo_hoin import finetune as _finetune

PartialFinetuneDataset = _finetune.PartialFinetuneDataset
cli_main = _finetune.cli_main
detect_device = _finetune.detect_device
main = _finetune.main
train_epoch = _finetune.train_epoch
val_epoch = _finetune.val_epoch

__all__ = [
    "PartialFinetuneDataset",
    "cli_main",
    "detect_device",
    "main",
    "train_epoch",
    "val_epoch",
]


if __name__ == "__main__":
    cli_main()
