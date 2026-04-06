"""
FastAPI 추론 서버
POST /predict  → 이미지 업로드 → 캐릭터 분류 결과 반환
GET  /classes  → 지원 캐릭터 목록
GET  /health   → 헬스 체크
"""

import io
import json
from contextlib import asynccontextmanager
from enum import Enum
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image
import albumentations as A

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ──────────────────────────────────────────────
# 설정
# ──────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
CHECKPOINT_DIR = BASE_DIR / "checkpoints"
MODEL_PATH = CHECKPOINT_DIR / "holo-hoin.pth"
ONNX_PATH = CHECKPOINT_DIR / "holo-hoin.onnx"
CLASS_MAP_PATH = CHECKPOINT_DIR / "class_map.json"
FALLBACK_ONNX_PATH = BASE_DIR / "holo-hoin.onnx"
FALLBACK_CLASS_MAP_PATH = BASE_DIR / "class_map.json"
IMG_SIZE = 224
TOP_K = 5

# ROCm EP 우선순위 (HSA_OVERRIDE_GFX_VERSION=11.0.0 환경변수 필요)
_ORT_PROVIDERS = ["ROCMExecutionProvider", "MIGraphXExecutionProvider", "CPUExecutionProvider"]


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


def _first_existing_path(*paths: Path) -> Path:
    for path in paths:
        if path.exists():
            return path
    return paths[0]


# ──────────────────────────────────────────────
# 캐릭터 메타데이터
# cardinal: 해당 지부(branch) 내 데뷔 순번 (1-indexed)
# ──────────────────────────────────────────────


class Affiliation(str, Enum):
    JP = "JP"
    EN = "EN"
    IND = "IND"


CHARACTER_META: dict[str, dict] = {
    # ── JP 0기생 ────────────────────────────────
    "tokino_sora": {
        "char_name": "Tokino Sora",
        "generation": 0,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "roboco": {
        "char_name": "Roboco-san",
        "generation": 0,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "sakura_miko": {
        "char_name": "Sakura Miko",
        "generation": 0,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "hoshimachi_suisei": {
        "char_name": "Hoshimachi Suisei",
        "generation": 0,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "azki": {"char_name": "AZKi", "generation": 0, "group": None, "affiliation": Affiliation.JP},
    # ── JP 1기생 ────────────────────────────────
    "yozora_mel": {
        "char_name": "Yozora Mel",
        "generation": 1,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "shirakami_fubuki": {
        "char_name": "Shirakami Fubuki",
        "generation": 1,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "natsuiro_matsuri": {
        "char_name": "Natsuiro Matsuri",
        "generation": 1,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "aki_rosenthal": {
        "char_name": "Aki Rosenthal",
        "generation": 1,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "akai_haato": {
        "char_name": "Akai Haato",
        "generation": 1,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    # ── JP 2기생 ────────────────────────────────
    "minato_aqua": {
        "char_name": "Minato Aqua",
        "generation": 2,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "murasaki_shion": {
        "char_name": "Murasaki Shion",
        "generation": 2,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "nakiri_ayame": {
        "char_name": "Nakiri Ayame",
        "generation": 2,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "yuzuki_choco": {
        "char_name": "Yuzuki Choco",
        "generation": 2,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    "oozora_subaru": {
        "char_name": "Oozora Subaru",
        "generation": 2,
        "group": None,
        "affiliation": Affiliation.JP,
    },
    # ── JP 3기생 (Fantasy) ──────────────────────
    "usada_pekora": {
        "char_name": "Usada Pekora",
        "generation": 3,
        "group": "Fantasy",
        "affiliation": Affiliation.JP,
    },
    "shiranui_flare": {
        "char_name": "Shiranui Flare",
        "generation": 3,
        "group": "Fantasy",
        "affiliation": Affiliation.JP,
    },
    "shirogane_noel": {
        "char_name": "Shirogane Noel",
        "generation": 3,
        "group": "Fantasy",
        "affiliation": Affiliation.JP,
    },
    "houshou_marine": {
        "char_name": "Houshou Marine",
        "generation": 3,
        "group": "Fantasy",
        "affiliation": Affiliation.JP,
    },
    # ── JP 4기생 (holoForce) ────────────────────
    "amane_kanata": {
        "char_name": "Amane Kanata",
        "generation": 4,
        "group": "holoForce",
        "affiliation": Affiliation.JP,
    },
    "tsunomaki_watame": {
        "char_name": "Tsunomaki Watame",
        "generation": 4,
        "group": "holoForce",
        "affiliation": Affiliation.JP,
    },
    "tokoyami_towa": {
        "char_name": "Tokoyami Towa",
        "generation": 4,
        "group": "holoForce",
        "affiliation": Affiliation.JP,
    },
    "himemori_luna": {
        "char_name": "Himemori Luna",
        "generation": 4,
        "group": "holoForce",
        "affiliation": Affiliation.JP,
    },
    # ── JP 5기생 (NePoLaBo) ─────────────────────
    "yukihana_lamy": {
        "char_name": "Yukihana Lamy",
        "generation": 5,
        "group": "NePoLaBo",
        "affiliation": Affiliation.JP,
    },
    "momosuzu_nene": {
        "char_name": "Momosuzu Nene",
        "generation": 5,
        "group": "NePoLaBo",
        "affiliation": Affiliation.JP,
    },
    "shishiro_botan": {
        "char_name": "Shishiro Botan",
        "generation": 5,
        "group": "NePoLaBo",
        "affiliation": Affiliation.JP,
    },
    "omaru_polka": {
        "char_name": "Omaru Polka",
        "generation": 5,
        "group": "NePoLaBo",
        "affiliation": Affiliation.JP,
    },
    # ── JP 6기생 (holoX) ────────────────────────
    "laplus_darknesss": {
        "char_name": "La+ Darknesss",
        "generation": 6,
        "group": "holoX",
        "affiliation": Affiliation.JP,
    },
    "takane_lui": {
        "char_name": "Takane Lui",
        "generation": 6,
        "group": "holoX",
        "affiliation": Affiliation.JP,
    },
    "hakui_koyori": {
        "char_name": "Hakui Koyori",
        "generation": 6,
        "group": "holoX",
        "affiliation": Affiliation.JP,
    },
    "sakamata_chloe": {
        "char_name": "Sakamata Chloe",
        "generation": 6,
        "group": "holoX",
        "affiliation": Affiliation.JP,
    },
    "kazama_iroha": {
        "char_name": "Kazama Iroha",
        "generation": 6,
        "group": "holoX",
        "affiliation": Affiliation.JP,
    },
    # ── DEV_IS ReGLOSS ──────────────────────────
    "hiodoshi_ao": {
        "char_name": "Hiodoshi Ao",
        "generation": None,
        "group": "ReGLOSS",
        "affiliation": Affiliation.JP,
    },
    "ichijou_ririka": {
        "char_name": "Ichijou Ririka",
        "generation": None,
        "group": "ReGLOSS",
        "affiliation": Affiliation.JP,
    },
    "juufuutei_raden": {
        "char_name": "Juufuutei Raden",
        "generation": None,
        "group": "ReGLOSS",
        "affiliation": Affiliation.JP,
    },
    "otonose_kanade": {
        "char_name": "Otonose Kanade",
        "generation": None,
        "group": "ReGLOSS",
        "affiliation": Affiliation.JP,
    },
    "todoroki_hajime": {
        "char_name": "Todoroki Hajime",
        "generation": None,
        "group": "ReGLOSS",
        "affiliation": Affiliation.JP,
    },
    # ── EN Myth (1기) ───────────────────────────
    "mori_calliope": {
        "char_name": "Mori Calliope",
        "generation": 1,
        "group": "Myth",
        "affiliation": Affiliation.EN,
    },
    "takanashi_kiara": {
        "char_name": "Takanashi Kiara",
        "generation": 1,
        "group": "Myth",
        "affiliation": Affiliation.EN,
    },
    "ninomae_inanis": {
        "char_name": "Ninomae Ina'nis",
        "generation": 1,
        "group": "Myth",
        "affiliation": Affiliation.EN,
    },
    "gawr_gura": {
        "char_name": "Gawr Gura",
        "generation": 1,
        "group": "Myth",
        "affiliation": Affiliation.EN,
    },
    "watson_amelia": {
        "char_name": "Watson Amelia",
        "generation": 1,
        "group": "Myth",
        "affiliation": Affiliation.EN,
    },
    # ── EN Council (2기) ────────────────────────
    "ceres_fauna": {
        "char_name": "Ceres Fauna",
        "generation": 2,
        "group": "Council",
        "affiliation": Affiliation.EN,
    },
    "ouro_kronii": {
        "char_name": "Ouro Kronii",
        "generation": 2,
        "group": "Council",
        "affiliation": Affiliation.EN,
    },
    "nanashi_mumei": {
        "char_name": "Nanashi Mumei",
        "generation": 2,
        "group": "Council",
        "affiliation": Affiliation.EN,
    },
    "hakos_baelz": {
        "char_name": "Hakos Baelz",
        "generation": 2,
        "group": "Council",
        "affiliation": Affiliation.EN,
    },
    # ── EN Advent (3기) ─────────────────────────
    "koseki_bijou": {
        "char_name": "Koseki Bijou",
        "generation": 3,
        "group": "Advent",
        "affiliation": Affiliation.EN,
    },
    "nerissa_ravencroft": {
        "char_name": "Nerissa Ravencroft",
        "generation": 3,
        "group": "Advent",
        "affiliation": Affiliation.EN,
    },
    "shiori_novella": {
        "char_name": "Shiori Novella",
        "generation": 3,
        "group": "Advent",
        "affiliation": Affiliation.EN,
    },
    "fuwamoco": {
        "char_name": "FUWAMOCO",
        "generation": 3,
        "group": "Advent",
        "affiliation": Affiliation.EN,
    },
    # ── EN Justice (4기) ────────────────────────
    "elizabeth_rose_bloodflame": {
        "char_name": "Elizabeth Rose Bloodflame",
        "generation": 4,
        "group": "Justice",
        "affiliation": Affiliation.EN,
    },
    "gigi_murin": {
        "char_name": "Gigi Murin",
        "generation": 4,
        "group": "Justice",
        "affiliation": Affiliation.EN,
    },
    "cecilia_immergreen": {
        "char_name": "Cecilia Immergreen",
        "generation": 4,
        "group": "Justice",
        "affiliation": Affiliation.EN,
    },
    "raora_panthera": {
        "char_name": "Raora Panthera",
        "generation": 4,
        "group": "Justice",
        "affiliation": Affiliation.EN,
    },
    # ── ID 1기 ──────────────────────────────────
    "airani_iofifteen": {
        "char_name": "Airani Iofifteen",
        "generation": 1,
        "group": None,
        "affiliation": Affiliation.IND,
    },
    "moona_hoshinova": {
        "char_name": "Moona Hoshinova",
        "generation": 1,
        "group": None,
        "affiliation": Affiliation.IND,
    },
    "ayunda_risu": {
        "char_name": "Ayunda Risu",
        "generation": 1,
        "group": None,
        "affiliation": Affiliation.IND,
    },
    # ── ID 2기 ──────────────────────────────────
    "kureiji_ollie": {
        "char_name": "Kureiji Ollie",
        "generation": 2,
        "group": None,
        "affiliation": Affiliation.IND,
    },
    "pavolia_reine": {
        "char_name": "Pavolia Reine",
        "generation": 2,
        "group": None,
        "affiliation": Affiliation.IND,
    },
    # ── ID 3기 ──────────────────────────────────
    "vestia_zeta": {
        "char_name": "Vestia Zeta",
        "generation": 3,
        "group": None,
        "affiliation": Affiliation.IND,
    },
    "kaela_kovalskia": {
        "char_name": "Kaela Kovalskia",
        "generation": 3,
        "group": None,
        "affiliation": Affiliation.IND,
    },
    "kobo_kanaeru": {
        "char_name": "Kobo Kanaeru",
        "generation": 3,
        "group": None,
        "affiliation": Affiliation.IND,
    },
    # ── others ──────────────────────────────────
    "others": {"char_name": "Others", "generation": None, "group": None, "affiliation": None},
}


# ──────────────────────────────────────────────
# Pydantic 스키마
# ──────────────────────────────────────────────


class CharMeta(BaseModel):
    char_name: str
    generation: Optional[int]
    group: Optional[str]
    affiliation: Optional[Affiliation]


class PredictResponse(BaseModel):
    file_name: str
    confidence: float
    meta: CharMeta


# ──────────────────────────────────────────────
# 모델 로더 (싱글턴)
# ──────────────────────────────────────────────


class ModelLoader:
    _instance = None

    def __init__(self):
        self.session = None  # onnxruntime.InferenceSession
        self.torch_model = None  # PyTorch fallback
        self.torch_device = None
        self.idx_to_class: dict[int, str] = {}
        self.transform = None
        self.backend: str = ""
        self._load()

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load(self):
        class_map_path = _first_existing_path(CLASS_MAP_PATH, FALLBACK_CLASS_MAP_PATH)

        with open(class_map_path, encoding="utf-8") as f:
            raw = json.load(f)
        self.idx_to_class = {int(k): v for k, v in raw.items()}
        num_classes = len(self.idx_to_class)

        onnx_path = _first_existing_path(ONNX_PATH, FALLBACK_ONNX_PATH)

        if onnx_path.exists():
            self._load_onnx(onnx_path)
        else:
            print(f"ONNX 모델 없음 — PyTorch fallback 사용 ({onnx_path})")
            self._load_torch(num_classes)

        # ToTensorV2 불필요 — numpy transpose로 대체
        self.transform = A.Compose(
            [
                A.Resize(IMG_SIZE, IMG_SIZE),
                A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ]
        )

        print(f"모델 로드 완료: {num_classes}개 클래스, backend={self.backend}")

    def _load_onnx(self, onnx_path: Path):
        import onnxruntime as ort

        available = ort.get_available_providers()
        providers = [p for p in _ORT_PROVIDERS if p in available]
        self.session = ort.InferenceSession(str(onnx_path), providers=providers)
        self.backend = f"onnx+{providers[0]}"
        print(f"ORT providers: {providers}")

    def _load_torch(self, num_classes: int):
        import torch
        import timm

        self.torch_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = timm.create_model(
            "swin_tiny_patch4_window7_224",
            pretrained=False,
            num_classes=num_classes,
        )
        model.load_state_dict(
            torch.load(MODEL_PATH, map_location=self.torch_device, weights_only=True)
        )
        self.torch_model = model.to(self.torch_device).eval()
        self.backend = f"torch+{self.torch_device}"

    def predict(self, img: Image.Image) -> tuple[str, float]:
        """(class_key, confidence) 반환"""
        img_np = np.array(img.convert("RGB"))
        transformed = self.transform(image=img_np)["image"]  # (H, W, 3) float32
        inp = transformed.transpose(2, 0, 1)[np.newaxis].astype(np.float32)  # (1, 3, H, W)

        if self.session is not None:
            logits = self.session.run(["logits"], {"input": inp})[0][0]
        else:
            import torch

            tensor = torch.from_numpy(inp).to(self.torch_device)
            with torch.no_grad():
                logits = self.torch_model(tensor).cpu().numpy()[0]

        probs = _softmax(logits)
        top_idx = int(probs.argmax())
        return self.idx_to_class[top_idx], float(probs[top_idx])


# ──────────────────────────────────────────────
# FastAPI 앱
# ──────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app):
    ModelLoader.get()
    yield


app = FastAPI(
    title="Hololive Character Classifier",
    description="홀로라이브 캐릭터 분류 API (Swin Transformer-Tiny)",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "backend": ModelLoader.get().backend}


@app.get("/classes")
def get_classes():
    loader = ModelLoader.get()
    return {
        "total": len(loader.idx_to_class),
        "classes": [
            {
                "id": idx,
                "character": char_key,
                **CHARACTER_META.get(
                    char_key,
                    {"char_name": char_key, "generation": None, "group": None, "affiliation": None},
                ),
            }
            for idx, char_key in sorted(loader.idx_to_class.items())
        ],
    }


@app.post("/predict", response_model=PredictResponse)
async def predict(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 허용됩니다")

    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="이미지 파일을 읽을 수 없습니다")

    char_key, confidence = ModelLoader.get().predict(img)
    meta_raw = CHARACTER_META.get(
        char_key,
        {"char_name": char_key, "generation": None, "group": None, "affiliation": None},
    )

    return PredictResponse(
        file_name=file.filename or "",
        confidence=confidence,
        meta=CharMeta(**meta_raw),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
