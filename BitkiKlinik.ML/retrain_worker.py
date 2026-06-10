"""
BitkiKlinik ML — RabbitMQ Yeniden Eğitim Worker Servisi
─────────────────────────────────────────────────────────
Bu servis, çıkarım (inference) sunucusundan bağımsız olarak çalışır.

Mimari:
    [C# API] → [RabbitMQ: bitkiklinik.retrain queue] → [Bu Worker]

Worker:
    - RabbitMQ kuyruğunu dinler
    - Mesaj aldığında retrain.py'deki retrain_model() fonksiyonunu çağırır
    - Sonucu outputs/retrain_state.json dosyasına yazar
    - serve.py'nin /retrain-status endpoint'i bu dosyayı okur

Başlatma:
    python retrain_worker.py

Bağımlılıklar (requirements.txt'e eklenmiş):
    pika>=1.3.2
"""

import json
import logging
import os
import shutil
import signal
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pika

# ─────────────────────────────────────────────
#  LOGGING
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("retrain_worker")

# ─────────────────────────────────────────────
#  SABITLER
# ─────────────────────────────────────────────
QUEUE_NAME    = "bitkiklinik.retrain"
STATE_FILE    = Path("outputs/retrain_state.json")
OUTPUT_DIR    = Path("outputs")

# RabbitMQ bağlantı ayarları (ortam değişkeninden veya varsayılan)
RABBITMQ_URL  = os.environ.get("RABBITMQ_URL", "amqp://***REMOVED***@localhost:5672/")

# ─────────────────────────────────────────────
#  DURUM YÖNETİMİ
# ─────────────────────────────────────────────
_state_lock = threading.Lock()

def read_state() -> dict:
    """Mevcut eğitim durumunu dosyadan okur."""
    if STATE_FILE.exists():
        try:
            with STATE_FILE.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Durum dosyası okunurken hata: {e}")
    return {"status": "idle", "progress": 0.0, "error": None, "lastTrainedAt": None}

def write_state(state: dict) -> None:
    """Eğitim durumunu dosyaya yazar. Thread-safe."""
    with _state_lock:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        with STATE_FILE.open("w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)

# ─────────────────────────────────────────────
#  ÇEKIRDEK: EĞİTİM FONKSIYONU
# ─────────────────────────────────────────────
def run_retrain(triggered_by: str = "system") -> None:
    """retrain.py'deki retrain_model() fonksiyonunu çalıştırır ve durumu günceller."""

    # Durum: Eğitim başlıyor
    write_state({
        "status"       : "training",
        "progress"     : 0.0,
        "error"        : None,
        "lastTrainedAt": None,
        "startedAt"    : datetime.now(timezone.utc).isoformat(),
        "triggeredBy"  : triggered_by
    })

    try:
        from retrain import retrain_model

        def progress_cb(epoch, num_epochs, t_loss, t_acc, v_loss, v_acc):
            """Eğitim döngüsünün her epoch'unda çağrılır."""
            progress = float(epoch) / float(num_epochs)
            write_state({
                "status"       : "training",
                "progress"     : round(progress, 4),
                "error"        : None,
                "lastTrainedAt": None,
                "currentEpoch" : epoch,
                "totalEpochs"  : num_epochs,
                "triggeredBy"  : triggered_by
            })
            logger.info(
                "Epoch %d/%d | Train Loss: %.4f | Train Acc: %.4f | Val Loss: %.4f | Val Acc: %.4f",
                epoch, num_epochs, t_loss, t_acc, v_loss, v_acc
            )

        logger.info("Yeniden eğitim başlatılıyor...")
        num_samples = retrain_model(progress_callback=progress_cb, triggered_by=triggered_by)
        logger.info("Yeniden eğitim tamamlandı. Kullanılan örnek: %d", num_samples)

        # Durum: Eğitim başarılı
        write_state({
            "status"       : "success",
            "progress"     : 1.0,
            "error"        : None,
            "lastTrainedAt": datetime.now(timezone.utc).isoformat(),
            "totalSamples" : num_samples,
        })

        # ── active_learning → memory_buffer'a taşı, ardından temizle ────────────
        # Retrain başarılı bitti; admin onaylı görseller artık memory_buffer'a
        # alınır. Böylece sonraki retrain temiz başlar, buffer ise büyümeye devam
        # eder (katastrofik unutmayı önleme stratejisi).
        moved_count = 0
        data_dir   = Path("data/active_learning")
        buffer_dir = Path("data/memory_buffer")

        if data_dir.exists():
            for label in os.listdir(data_dir):
                label_dir = data_dir / label
                if not label_dir.is_dir():
                    continue
                target_dir = buffer_dir / label
                target_dir.mkdir(parents=True, exist_ok=True)
                for f in os.listdir(label_dir):
                    if not f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                        continue
                    src = label_dir / f
                    dst = target_dir / f
                    # Hedefte aynı isimde dosya varsa çakışmayı önle
                    if dst.exists():
                        stem, suffix = src.stem, src.suffix
                        dst = target_dir / f"{stem}_{uuid.uuid4().hex[:8]}{suffix}"
                    shutil.move(str(src), str(dst))
                    moved_count += 1

            # active_learning alt klasörlerini temizle (ana klasörü bırak)
            for item in data_dir.iterdir():
                if item.is_dir():
                    shutil.rmtree(item)

            logger.info(
                "Aktif öğrenme görselleri memory buffer'a taşındı: %d dosya. "
                "data/active_learning temizlendi.", moved_count
            )

        # C# API Webhook bildirimi göndererek yeni model dosyalarının Backblaze B2'ye yedeklenmesini tetikle
        try:
            import requests
            dotnet_host = os.environ.get("DOTNET_HOST", "localhost")
            dotnet_port = os.environ.get("DOTNET_PORT", "5135")
            webhook_url = f"http://{dotnet_host}:{dotnet_port}/api/admin/active-learning/webhook/retrain-success"
            requests.post(webhook_url, json={"status": "success"}, timeout=5)
            logger.info("C# API model yedekleme webhook bildirimi başarıyla gönderildi.")
        except Exception as web_ex:
            logger.warning(f"C# API webhook bildirimi gönderilemedi: {web_ex}")

    except ValueError as e:
        # Yetersiz örnek sayısı veya veri eksikliği
        error_msg = str(e)
        logger.warning("Eğitim reddedildi (yetersiz veri): %s", error_msg)
        write_state({
            "status"  : "error",
            "progress": 0.0,
            "error"   : error_msg,
        })

    except Exception as e:
        logger.error("Eğitim sırasında beklenmeyen hata: %s", e, exc_info=True)
        write_state({
            "status"  : "error",
            "progress": 0.0,
            "error"   : str(e),
        })

# ─────────────────────────────────────────────
#  RABBITMQ CONSUMER
# ─────────────────────────────────────────────
def on_message(channel, method, _properties, body):
    """Kuyruktan gelen mesajı işler."""
    triggered_by = "system"
    try:
        payload = json.loads(body.decode("utf-8"))
        logger.info("Kuyruktan yeniden eğitim mesajı alındı: %s", payload)
        if isinstance(payload, dict):
            triggered_by = payload.get("triggeredBy", "system")
    except Exception:
        logger.warning("Mesaj parse edilemedi, yine de işleniyor.")

    # Eğitimi ana thread'de çalıştır (pika consumer thread'i bloklar, bu kasıtlı)
    run_retrain(triggered_by=triggered_by)

    # Mesajı başarıyla işlenmiş olarak onayla
    channel.basic_ack(delivery_tag=method.delivery_tag)
    logger.info("Mesaj onaylandı (ack). Sonraki mesaj bekleniyor...")


def start_worker() -> None:
    """RabbitMQ bağlantısını kurar ve mesaj döngüsünü başlatır."""

    logger.info("BitkiKlinik Yeniden Eğitim Worker başlatılıyor. Kuyruk: %s", QUEUE_NAME)
    logger.info("RabbitMQ URL: %s", RABBITMQ_URL.replace(":guest@", ":***@"))

    params     = pika.URLParameters(RABBITMQ_URL)
    params.heartbeat = 0
    connection = pika.BlockingConnection(params)
    channel    = connection.channel()

    # Kuyruk idempotent: varsa dokunmaz, yoksa oluşturur
    channel.queue_declare(queue=QUEUE_NAME, durable=True)

    # Bir mesajı tam işlemeden bir sonraki mesajı alma (adil dağıtım)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=on_message)

    logger.info("Worker hazır. Kuyruk dinleniyor: %s", QUEUE_NAME)
    logger.info("Durdurmak için CTRL+C'ye basın.")

    def _shutdown(_sig, _frame):
        logger.info("Worker durduruluyor...")
        channel.stop_consuming()

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    channel.start_consuming()

    connection.close()
    logger.info("Worker durduruldu.")


if __name__ == "__main__":
    # İlk durum dosyası yoksa oluştur
    if not STATE_FILE.exists():
        write_state({"status": "idle", "progress": 0.0, "error": None, "lastTrainedAt": None})

    start_worker()
