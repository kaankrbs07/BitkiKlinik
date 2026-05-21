"""
BitkiKlinik AI — FastAPI Inference Servisi
───────────────────────────────────────────
Endpoint : POST /analyze  → { disease, confidence }
Endpoint : GET  /health   → { status, model, device }

Model    : outputs/efficientnet_b0_plant.pt  (TorchScript FP32)
           outputs/efficientnet_b0_plant.quant.pt  (INT8, CPU)
Sınıflar : outputs/class_map.json

Başlatma :
    uvicorn serve:app --host 0.0.0.0 --port 8000 --reload
"""

import io
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from PIL import Image
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from torchvision import transforms
import torchvision.transforms.functional as F

# ─────────────────────────────────────────────
#  LOGGING
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
#  PATHS — train.py ile birebir uyumlu
# ─────────────────────────────────────────────
OUTPUT_DIR      = Path("outputs")
MODEL_FP32_PATH = OUTPUT_DIR / "efficientnet_b0_plant.pt"         # TorchScript FP32
MODEL_INT8_PATH = OUTPUT_DIR / "efficientnet_b0_plant.quant.pt"   # INT8 (CPU)
CLASS_MAP_PATH  = OUTPUT_DIR / "class_map.json"

# ─────────────────────────────────────────────
#  PREPROCESSING — train.py val_tf ile aynı
# ─────────────────────────────────────────────
IMG_SIZE = 224
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

preprocess = transforms.Compose([
    transforms.Resize(int(IMG_SIZE * 1.14)),   # 256
    transforms.CenterCrop(IMG_SIZE),           # 224
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

# ─────────────────────────────────────────────
#  GLOBAL DURUM
# ─────────────────────────────────────────────
state: dict = {
    "model"     : None,
    "class_map" : None,   # idx (str) → label (str)
    "device"    : None,
    "model_type": None,   # "fp32" | "int8"
}

ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp"
}

# ─────────────────────────────────────────────
#  MODEL YÜKLEYİCİ
# ─────────────────────────────────────────────
def load_model() -> None:
    """
    Önce GPU + FP32 modeli dener.
    GPU yoksa veya FP32 bulunamazsa INT8 (CPU) modeline geçer.
    İkisi de yoksa hata fırlatır — servis başlamaz.
    """
    # Sınıf haritası
    if not CLASS_MAP_PATH.exists():
        raise FileNotFoundError(
            f"class_map.json bulunamadı: {CLASS_MAP_PATH}\n"
            "Lütfen önce 'python train.py' ile modeli eğitin."
        )
    with CLASS_MAP_PATH.open(encoding="utf-8") as f:
        state["class_map"] = json.load(f)   # {"0": "Apple__black_rot", ...}
    logger.info("Sınıf haritası yüklendi: %d sınıf", len(state["class_map"]))

    # GPU + FP32
    if torch.cuda.is_available() and MODEL_FP32_PATH.exists():
        device = torch.device("cuda")
        model  = torch.jit.load(str(MODEL_FP32_PATH), map_location=device)
        model.eval()
        state.update(model=model, device=device, model_type="fp32")
        logger.info("FP32 model GPU'ya yüklendi (%s)", torch.cuda.get_device_name(0))
        return

    # CPU + INT8
    if MODEL_INT8_PATH.exists():
        device = torch.device("cpu")
        model  = torch.jit.load(str(MODEL_INT8_PATH), map_location=device)
        model.eval()
        state.update(model=model, device=device, model_type="int8")
        logger.info("INT8 quantized model CPU'ya yüklendi")
        return

    # FP32 CPU fallback (GPU yok ama fp32 var)
    if MODEL_FP32_PATH.exists():
        device = torch.device("cpu")
        model  = torch.jit.load(str(MODEL_FP32_PATH), map_location=device)
        model.eval()
        state.update(model=model, device=device, model_type="fp32-cpu")
        logger.warning("FP32 model CPU'ya yüklendi — inference yavaş olabilir")
        return

    raise FileNotFoundError(
        f"Model dosyası bulunamadı: {MODEL_FP32_PATH} veya {MODEL_INT8_PATH}\n"
        "Lütfen önce 'python train.py' ile modeli eğitin."
    )


# ─────────────────────────────────────────────
#  INFERENCE (with TTA - Test Time Augmentation)
# ─────────────────────────────────────────────
@torch.no_grad()
def predict_tta(image: Image.Image, tta_passes: int = 5) -> tuple[str, float]:
    """
    TTA uygulayarak daha stabil ve yüksek güvenli tahmin üretir.
    - Orijinal, Yatay Ters, Dikey Ters ve Hafif Döndürülmüş hallerini analiz eder.
    - Softmax çıktılarını ortalar.
    """
    all_probs = []
    
    def get_prob(img: Image.Image) -> torch.Tensor:
        # Normalizasyon uygula ve tahmin et
        tensor = preprocess(img).unsqueeze(0).to(state["device"])
        logits = state["model"](tensor)
        # Temperature Scaling (0.4)
        return torch.softmax(logits / 0.4, dim=1)  # type: ignore
    
    # Pass 1: Orijinal
    all_probs.append(get_prob(image))
    
    if tta_passes > 1:
        # Pass 2: Yatay Çevirme
        flipped_h = F.hflip(image)  # type: ignore
        all_probs.append(get_prob(flipped_h))
        
        # Pass 3: Dikey Çevirme
        flipped_v = F.vflip(image)  # type: ignore
        all_probs.append(torch.softmax(state["model"](preprocess(flipped_v).unsqueeze(0).to(state["device"])), dim=1))
        
        # Pass 4: Hafif Saat Yönünde Döndürme
        rot_p = F.rotate(image, 5)  # type: ignore
        all_probs.append(torch.softmax(state["model"](preprocess(rot_p).unsqueeze(0).to(state["device"])), dim=1))
        
        # Pass 5: Hafif Saat Yönü Tersine Döndürme
        rot_n = F.rotate(image, -5)  # type: ignore
        all_probs.append(torch.softmax(state["model"](preprocess(rot_n).unsqueeze(0).to(state["device"])), dim=1))

    # Tüm pass'lerin ortalamasını al
    avg_probs  = torch.stack(all_probs).mean(dim=0)
    confidence = float(avg_probs.max())
    class_idx  = str(int(avg_probs.argmax()))

    label = state["class_map"].get(class_idx, f"unknown_{class_idx}")
    return label, confidence


# ─────────────────────────────────────────────
#  UYGULAMA YAŞAM DÖNGÜSÜ
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: startup → modeli yükle, shutdown → temizle."""
    logger.info("BitkiKlinik AI servisi başlatılıyor...")
    load_model()
    logger.info("Servis hazır. Endpoint: POST /analyze")
    yield
    # Shutdown
    state["model"] = None
    logger.info("BitkiKlinik AI servisi kapatıldı.")


app = FastAPI(
    title       = "BitkiKlinik AI Servisi",
    description = "EfficientNet-B0 tabanlı bitki hastalığı tespiti.",
    version     = "1.0.0",
    lifespan    = lifespan,
)


# ─────────────────────────────────────────────
#  ENDPOINTS
# ─────────────────────────────────────────────

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Bitki görseli analiz eder.

    - **file**: Multipart image (jpg/jpeg/png/webp)
    - **Döndürür**: `{ disease: str, confidence: float }`

    C# API beklentisiyle tam uyumlu:
    - Field adı: `file` (PlantAnalysisService.cs satır 135)
    - Yanıt: `PythonAnalysisResponseDTO { Disease, Confidence }`
    """
    if state["model"] is None:
        raise HTTPException(status_code=503, detail="Model henüz yüklenmedi.")

    # İçerik türü kontrolü
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Desteklenmeyen dosya türü: {content_type}. "
                   f"İzin verilenler: {', '.join(ALLOWED_CONTENT_TYPES)}"
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Yüklenen dosya boş.")

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Görsel işlenemedi: {exc}")

    disease, confidence = predict_tta(image)

    logger.info("Analiz (TTA): label=%s  confidence=%.4f  model=%s",
                disease, confidence, state["model_type"])

    # C# → PythonAnalysisResponseDTO.Disease + .Confidence
    return JSONResponse(content={
        "disease"   : disease,
        "confidence": round(confidence, 6),
    })


@app.get("/health")
async def health():
    """Servis sağlık kontrolü."""
    model_ready = state["model"] is not None
    return JSONResponse(
        status_code = 200 if model_ready else 503,
        content     = {
            "status"    : "ready" if model_ready else "model_not_loaded",
            "model"     : state["model_type"],
            "device"    : str(state["device"]),
            "num_classes": len(state["class_map"]) if state["class_map"] else 0,
        }
    )
