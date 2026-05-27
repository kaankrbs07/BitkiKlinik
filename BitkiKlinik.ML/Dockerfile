# ─────────────────────────────────────────────
#  BitkiKlinik ML — Dockerfile
#  Çok aşamalı build:
#    • base   → ortak Python ortamı + bağımlılıklar
#    • serve  → FastAPI inference sunucusu
#    • worker → RabbitMQ retrain worker
# ─────────────────────────────────────────────

# ── Temel imaj ────────────────────────────────
FROM python:3.11-slim AS base

WORKDIR /app

# Sistem bağımlılıkları (libgomp: PyTorch için gerekli)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Bağımlılıkları önce kopyala (Docker cache avantajı)
COPY requirements.txt .

# PyTorch GPU versiyonunu kuruyoruz
RUN pip install --no-cache-dir torch torchvision torchaudio \
    && pip install --no-cache-dir -r requirements.txt

# Uygulama kaynak kodunu kopyala
COPY serve.py retrain.py retrain_worker.py ./

# Gerekli dizinleri oluştur
RUN mkdir -p outputs data/active_learning

# ── Inference Sunucusu hedefi ─────────────────
FROM base AS serve
EXPOSE 8000
CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8000"]

# ── Retrain Worker hedefi ─────────────────────
FROM base AS worker
CMD ["python", "retrain_worker.py"]
