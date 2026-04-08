"""Device and mixed-precision helpers for training."""

import torch

try:
    import intel_extension_for_pytorch as ipex  # noqa: F401

    IPEX_AVAILABLE = True
except ImportError:
    IPEX_AVAILABLE = False


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
