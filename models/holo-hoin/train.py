"""Compatibility wrapper for the training CLI."""

from holo_hoin import train as _train

build_model = _train.build_model
detect_device = _train.detect_device
freeze_backbone = _train.freeze_backbone
load_checkpoint = _train.load_checkpoint
main = _train.main
make_scaler = _train.make_scaler
save_checkpoint = _train.save_checkpoint
test_epoch = _train.test_epoch
train = _train.train
train_epoch = _train.train_epoch
unfreeze_all = _train.unfreeze_all
val_epoch = _train.val_epoch

__all__ = [
    "build_model",
    "detect_device",
    "freeze_backbone",
    "load_checkpoint",
    "main",
    "make_scaler",
    "save_checkpoint",
    "test_epoch",
    "train",
    "train_epoch",
    "unfreeze_all",
    "val_epoch",
]


if __name__ == "__main__":
    main()
