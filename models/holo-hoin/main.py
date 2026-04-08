"""Compatibility wrapper for the holo-hoin FastAPI app."""

from holo_hoin import api as _api

app = _api.app
predict_for_cli = _api.predict_for_cli

__all__ = ["app", "predict_for_cli"]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
