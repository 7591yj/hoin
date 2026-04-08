"""Compatibility wrapper for ONNX smoke/evaluation."""

from holo_hoin import eval_onnx as _eval_onnx

evaluate = _eval_onnx.evaluate
evaluate_test_split = _eval_onnx.evaluate_test_split
load_class_map = _eval_onnx.load_class_map
load_session = _eval_onnx.load_session
main = _eval_onnx.main
run_smoke = _eval_onnx.run_smoke

__all__ = [
    "evaluate",
    "evaluate_test_split",
    "load_class_map",
    "load_session",
    "main",
    "run_smoke",
]


if __name__ == "__main__":
    main()
