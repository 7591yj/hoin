"""Compatibility wrapper for the ONNX export CLI."""

from holo_hoin import export_onnx as _export_onnx

export = _export_onnx.export
main = _export_onnx.main

__all__ = ["export", "main"]


if __name__ == "__main__":
    main()
