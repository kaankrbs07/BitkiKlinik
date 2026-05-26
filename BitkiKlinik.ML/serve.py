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

import asyncio
import io
import json
import logging
import os
import uuid
import datetime
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from PIL import Image
from fastapi import FastAPI, File, HTTPException, UploadFile, Form
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
META_PATH       = OUTPUT_DIR / "active_learning_meta.json"

# ─────────────────────────────────────────────
#  ACTIVE LEARNING METADATA HELPERS
# ─────────────────────────────────────────────
def load_active_learning_meta() -> list[str]:
    """
    Eğitilmiş aktif öğrenme dosyalarının listesini ve son eğitim zamanını dosyadan yükler.
    """
    if META_PATH.exists():
        try:
            with META_PATH.open("r", encoding="utf-8") as f:
                data = json.load(f)
                state["last_trained_at"] = data.get("last_trained_at")
                state["trained_files"] = data.get("trained_files", [])
                return state["trained_files"]
        except Exception as e:
            logger.error(f"Metadata yükleme hatası: {e}")
    state["trained_files"] = []
    return []

def save_active_learning_meta(trained_files: list[str]) -> None:
    """
    Eğitilmiş dosyaların listesini ve son eğitim zamanını dosyaya kaydeder.
    """
    try:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        data = {
            "last_trained_at": state["last_trained_at"],
            "trained_files": trained_files
        }
        with META_PATH.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Metadata kaydetme hatası: {e}")

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
#  GLOBAL DURUM & LOCKS
# ─────────────────────────────────────────────
state: dict = {
    "model"     : None,
    "class_map" : None,   # idx (str) → label (str)
    "device"    : None,
    "model_type": None,   # "fp32" | "int8"
    
    # Aktif Öğrenme Yeniden Eğitim Durumu
    "training_status": "idle",
    "training_progress": 0.0,
    "training_error": None,
    "last_trained_at": None,
    "trained_files": [],
}

# Model yükleme ve inference işlemlerini senkronize etmek için kilit
model_lock = threading.Lock()

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
    with model_lock:
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
    with model_lock:
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
    load_active_learning_meta()
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
def analyze(file: UploadFile = File(...)):
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

    image_bytes = file.file.read()
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


@app.post("/active-learning/add-sample")
def add_sample(file: UploadFile = File(...), label: str = Form(...)):
    """
    Aktif öğrenme için yeni bir görsel örneği ekler.
    Görsel 'data/active_learning/{label}/' klasörüne kaydedilir.
    """
    if state["class_map"] is None:
        raise HTTPException(status_code=503, detail="Sınıf haritası henüz yüklenmedi.")

    # Etiketin geçerli olup olmadığını kontrol edelim
    valid_labels = list(state["class_map"].values())
    if label not in valid_labels:
        raise HTTPException(
            status_code=400,
            detail=f"Geçersiz etiket: '{label}'. Geçerli etiketlerden biri olmalıdır."
        )

    # Görsel türü kontrolü
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Desteklenmeyen dosya türü: {content_type}."
        )

    try:
        # Klasörü oluştur
        label_dir = Path("data/active_learning") / label
        label_dir.mkdir(parents=True, exist_ok=True)

        # Görseli benzersiz bir isimle kaydet
        file_extension = Path(file.filename or "image.jpg").suffix or ".jpg"
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = label_dir / unique_filename

        image_bytes = file.file.read()
        with file_path.open("wb") as f:
            f.write(image_bytes)

        logger.info(f"Aktif öğrenme örneği eklendi: label={label}, path={file_path}")
        return JSONResponse(content={"message": "Örnek başarıyla eklendi.", "path": str(file_path)})

    except Exception as exc:
        logger.error(f"Örnek eklenirken hata: {exc}")
        raise HTTPException(status_code=500, detail=f"Örnek eklenemedi: {exc}")


@app.post("/active-learning/retrain")
async def retrain():
    """
    Arka planda modeli aktif öğrenme verileriyle yeniden eğitmeyi tetikler.

    asyncio.to_thread() ile çalıştırılır:
    - Eğitim bloklayan (CPU-bound) bir fonksiyondur; thread-pool executor'a taşınır.
    - Event loop serbest kalır; diğer /analyze veya /health istekleri engellenmez.
    - threading.Thread + time.sleep() GIL geçici çözümüne gerek kalmaz.
    """
    if state["training_status"] == "training":
        raise HTTPException(status_code=400, detail="Yeniden eğitim zaten devam ediyor.")

    state.update(
        training_status="training",
        training_progress=0.0,
        training_error=None
    )

    def _blocking_train() -> None:
        """Thread-pool'da çalışan senkron eğitim fonksiyonu."""
        try:
            from retrain import retrain_model

            def progress_cb(epoch, num_epochs, t_loss, t_acc, v_loss, v_acc):
                state["training_progress"] = float(epoch) / float(num_epochs)
                logger.info(
                    "Yeniden Eğitim İlerlemesi: Epoch %d/%d - Loss: %.4f, Val Acc: %.4f",
                    epoch, num_epochs, t_loss, v_acc
                )

            logger.info("Aktif öğrenme yeniden eğitimi thread-pool'da başlatılıyor...")
            num_samples = retrain_model(progress_callback=progress_cb)
            logger.info("Yeniden eğitim tamamlandı! Toplam %d örnek kullanıldı.", num_samples)

            # Modeli sıcak yükleme (hot reload) — model_lock zaten load_model içinde
            logger.info("Yeni ağırlıklar sıcak-yükleniyor...")
            load_model()
            logger.info("Model başarıyla sıcak-yüklendi!")

            # Eğitilen dosya listesini güncelle
            all_files = []
            data_dir = Path("data/active_learning")
            if data_dir.exists():
                for label in os.listdir(data_dir):
                    label_dir = data_dir / label
                    if label_dir.is_dir():
                        for f in os.listdir(label_dir):
                            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                                all_files.append((label_dir / f).as_posix())

            state["trained_files"]   = all_files
            state["last_trained_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            save_active_learning_meta(all_files)

            state.update(
                training_status="success",
                training_progress=1.0,
                last_trained_at=state["last_trained_at"],
            )
        except Exception as exc:
            logger.error("Yeniden eğitim hatası: %s", exc, exc_info=True)
            state.update(
                training_status="error",
                training_error=str(exc),
                training_progress=0.0,
            )

    # asyncio.to_thread: bloklayan _blocking_train'i thread-pool executor'a taşır.
    # Event loop serbest kalır — GIL paylaşımı için time.sleep() gerekmiyor.
    asyncio.ensure_future(asyncio.to_thread(_blocking_train))

    return JSONResponse(content={"message": "Yeniden eğitim arka planda başlatıldı."})


@app.get("/active-learning/retrain-status")
def retrain_status():
    """
    Yeniden eğitim durumunu ve aktif öğrenme veri seti istatistiklerini döner.
    """
    samples_breakdown = {}
    total_samples = 0
    current_samples = 0
    data_dir = Path("data/active_learning")
    trained_files = set(state.get("trained_files", []))

    if data_dir.exists():
        for label in os.listdir(data_dir):
            label_dir = data_dir / label
            if label_dir.is_dir():
                files = [f for f in os.listdir(label_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]
                count = len(files)
                if count > 0:
                    samples_breakdown[label] = count
                    total_samples += count
                    for f in files:
                        rel_path = (label_dir / f).as_posix()
                        if rel_path not in trained_files:
                            current_samples += 1

    return JSONResponse(content={
        "status": state["training_status"],
        "progress": round(state["training_progress"], 4),
        "error": state["training_error"],
        "lastTrainedAt": state["last_trained_at"],
        "totalSamples": total_samples,
        "currentSamples": current_samples,
        "samplesBreakdown": samples_breakdown
    })
