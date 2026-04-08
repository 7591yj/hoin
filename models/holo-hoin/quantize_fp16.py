"""Compatibility wrapper for the FP16 quantization CLI."""

from holo_hoin import quantize_fp16 as _quantize_fp16

evaluate = _quantize_fp16.evaluate
get_device = _quantize_fp16.get_device
load_model = _quantize_fp16.load_model
main = _quantize_fp16.main

__all__ = ["evaluate", "get_device", "load_model", "main"]


if __name__ == "__main__":
    main()
