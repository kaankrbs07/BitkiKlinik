import os
import json
import random
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from PIL import Image
import torchvision.models as models
from torchvision import transforms

# ─────────────────────────────────────────────
#  DATASET SINIFI
# ─────────────────────────────────────────────
class ActiveLearningDataset(Dataset):
    def __init__(self, samples, transform=None):
        self.samples = samples
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        fpath, target = self.samples[idx]
        img = Image.open(fpath).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, target


# ─────────────────────────────────────────────
#  YARDIMCI: VERİ TOPLAMA
# ─────────────────────────────────────────────
_VALID_EXTS = ('.png', '.jpg', '.jpeg', '.webp')

def _collect_samples(directory: str, class_to_idx: dict) -> tuple[list, set]:
    """
    Bir klasör altındaki görselleri toplar.
    (dosya_yolu, sınıf_indisi) çiftleri ve bulunan aktif sınıf indisleri döner.
    """
    samples: list      = []
    active_indices: set = set()

    if not os.path.exists(directory):
        return samples, active_indices

    for label in os.listdir(directory):
        label_dir = os.path.join(directory, label)
        if not os.path.isdir(label_dir):
            continue
        if label not in class_to_idx:
            print(f"  Uyarı: '{label}' sınıf haritasında bulunamadı, atlanıyor.")
            continue
        idx = class_to_idx[label]
        active_indices.add(idx)
        for fname in os.listdir(label_dir):
            if fname.lower().endswith(_VALID_EXTS):
                samples.append((os.path.join(label_dir, fname), idx))

    return samples, active_indices


# ─────────────────────────────────────────────
#  ANA EĞİTİM FONKSİYONU
# ─────────────────────────────────────────────
def retrain_model(progress_callback=None):
    """
    Aktif öğrenme + memory buffer ile modeli yeniden eğitir.

    Strateji — Katastrofik Unutmayı Önleme:
    ─────────────────────────────────────────
    1. Tüm features katmanları tamamen dondurulur (requires_grad=False).
       BatchNorm running stats'ların bozulmaması için features.eval() uygulanır.

    2. Yalnızca classifier (son Linear katman) güncellenir.

    3. Her batch adımından SONRA, aktif öğrenme setinde BULUNMAYAN sınıfların
       classifier ağırlık ve bias'ları orijinal değerlerine geri yazılır.
       Bu, o sınıfların karar sınırlarını byte-byte korur.

    4. Eğitim verisi:
       a) data/active_learning/  → Admin tarafından doğrulanmış yeni görseller
       b) data/memory_buffer/    → Her aktif sınıf için orijinal dataset'ten
                                   300 görsel (offline augmentation dahil)
       Memory buffer yoksa sadece active_learning verisiyle devam edilir.
    """

    # ── Yollar ──────────────────────────────────────────────────────────────
    active_dir  = "data/active_learning"
    buffer_dir  = "data/memory_buffer"
    class_map_path  = "outputs/class_map.json"
    model_pth_path  = "outputs/efficientnet_b0_plant.pth"
    model_pt_path   = "outputs/efficientnet_b0_plant.pt"
    model_quant_path = "outputs/efficientnet_b0_plant.quant.pt"

    # ── 1. Sınıf Haritası ───────────────────────────────────────────────────
    if not os.path.exists(class_map_path):
        raise FileNotFoundError(f"Sınıf haritası bulunamadı: {class_map_path}")
    with open(class_map_path, "r", encoding="utf-8") as f:
        class_map = json.load(f)
    class_to_idx = {v: int(k) for k, v in class_map.items()}

    # ── 2. Aktif Öğrenme Örnekleri (admin doğrulamaları) ───────────────────
    al_samples, active_class_indices = _collect_samples(active_dir, class_to_idx)

    if not al_samples:
        raise ValueError(
            "Yeniden eğitim için aktif öğrenme veri setinde hiç görsel bulunamadı. "
            "Lütfen önce admin panelinden en az bir teşhisi doğrulayın."
        )

    # Memory buffer olmadığında minimum örnek kontrolü
    has_buffer = os.path.exists(buffer_dir) and any(
        os.scandir(buffer_dir)
    )
    MIN_AL_SAMPLES = 5 if has_buffer else 30
    if len(al_samples) < MIN_AL_SAMPLES:
        raise ValueError(
            f"Yetersiz aktif öğrenme verisi: {len(al_samples)} görsel mevcut, "
            f"en az {MIN_AL_SAMPLES} doğrulanmış görsel gereklidir. "
            f"({MIN_AL_SAMPLES - len(al_samples)} görsel daha gerekiyor)"
        )

    print(f"Aktif öğrenme: {len(al_samples)} görsel, {len(active_class_indices)} sınıf")
    print(f"Aktif sınıflar: {sorted(active_class_indices)}")

    # ── 3. Memory Buffer Örnekleri (sadece aktif sınıflar için) ────────────
    buffer_samples: list = []
    if has_buffer:
        raw_buf, _ = _collect_samples(buffer_dir, class_to_idx)
        # Yalnızca aktif sınıflara ait buffer görsellerini al
        buffer_samples = [(p, idx) for p, idx in raw_buf
                          if idx in active_class_indices]
        print(f"Memory buffer : {len(buffer_samples)} görsel (aktif sınıflar)")
    else:
        print("Memory buffer : bulunamadı, yalnızca aktif öğrenme verisi kullanılıyor.")

    # ── 4. Eğitim Veri Seti Oluşturma ──────────────────────────────────────
    all_samples = al_samples + buffer_samples
    random.shuffle(all_samples)

    val_split = 0.15
    if len(all_samples) >= 10:
        split_idx    = int(len(all_samples) * (1 - val_split))
        train_samples = all_samples[:split_idx]
        val_samples   = all_samples[split_idx:]
    else:
        train_samples = all_samples
        val_samples   = all_samples

    print(f"Eğitim: {len(train_samples)} görsel | Doğrulama: {len(val_samples)} görsel")

    # ── 5. Transform Tanımları ──────────────────────────────────────────────
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.75, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.15),
        transforms.RandomRotation(20),
        transforms.ColorJitter(brightness=0.3, contrast=0.3,
                               saturation=0.3, hue=0.05),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    val_transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    train_dataset = ActiveLearningDataset(train_samples, transform=train_transform)
    val_dataset   = ActiveLearningDataset(val_samples,   transform=val_transform)

    batch_size   = min(32, max(1, len(train_samples)))
    train_loader = DataLoader(train_dataset, batch_size=batch_size,
                              shuffle=True,  drop_last=False, num_workers=0)
    val_loader   = DataLoader(val_dataset,   batch_size=batch_size,
                              shuffle=False, drop_last=False, num_workers=0)

    # ── 6. Model Yükleme ────────────────────────────────────────────────────
    if not os.path.exists(model_pth_path):
        raise FileNotFoundError(f"Temel model ağırlıkları bulunamadı: {model_pth_path}")

    checkpoint = torch.load(model_pth_path, map_location="cpu")
    num_classes = checkpoint["num_classes"]

    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(1280, num_classes)
    model.load_state_dict(checkpoint["model_state_dict"])

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Cihaz: {device}")
    model.to(device)

    # ── 7. Katman Dondurma: Tüm features tamamen dondurulur ─────────────────
    # Sadece classifier[1] (Linear) eğitilebilir kalır.
    for param in model.features.parameters():
        param.requires_grad = False
    for param in model.classifier.parameters():
        param.requires_grad = True

    print(f"Dondurulmuş   : model.features (tüm katmanlar)")
    print(f"Eğitilebilir  : model.classifier")

    # ── 8. Orijinal Classifier Ağırlıklarını Sakla ──────────────────────────
    # Eğitim sırasında aktif olmayan sınıfların ağırlıkları
    # her batch adımı sonrasında bu değerlere geri yazılır.
    orig_weight = model.classifier[1].weight.detach().clone()
    orig_bias   = model.classifier[1].bias.detach().clone()

    inactive_indices = [i for i in range(num_classes)
                        if i not in active_class_indices]
    print(f"Korunan sınıf : {len(inactive_indices)} adet "
          f"(ağırlıkları her adımda orijinaline geri yazılır)")

    # ── 9. Optimizer & Kayıp ─────────────────────────────────────────────────
    # Classifier-only güncelleme → daha yüksek learning rate uygun
    optimizer = optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=1e-3, weight_decay=1e-4
    )
    criterion = nn.CrossEntropyLoss()
    epochs    = 10

    # ── 10. Eğitim Döngüsü ──────────────────────────────────────────────────
    for epoch in range(epochs):

        # features BatchNorm istatistiklerinin bozulmaması için eval modunda tut
        model.features.eval()
        model.classifier.train()

        running_loss = 0.0
        correct = 0
        total   = 0

        for images, targets in train_loader:
            images, targets = images.to(device), targets.to(device)

            optimizer.zero_grad()
            outputs = model(images)
            loss    = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            # ── Aktif Olmayan Sınıfların Ağırlıklarını Geri Yaz ────────────
            # Bu blok, memory-safe ve hızlı: sadece inaktif satırları değiştirir.
            with torch.no_grad():
                for i in inactive_indices:
                    model.classifier[1].weight[i] = orig_weight[i].to(device)
                    model.classifier[1].bias[i]   = orig_bias[i].to(device)
            # ───────────────────────────────────────────────────────────────

            running_loss += loss.item() * images.size(0)
            _, predicted  = outputs.max(1)
            total   += targets.size(0)
            correct += predicted.eq(targets).sum().item()

        train_loss = running_loss / total if total > 0 else 0.0
        train_acc  = correct / total      if total > 0 else 0.0

        # Doğrulama
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total   = 0

        with torch.no_grad():
            for images, targets in val_loader:
                images, targets = images.to(device), targets.to(device)
                outputs = model(images)
                loss    = criterion(outputs, targets)
                val_loss    += loss.item() * images.size(0)
                _, predicted = outputs.max(1)
                val_total   += targets.size(0)
                val_correct += predicted.eq(targets).sum().item()

        valid_loss = val_loss / val_total   if val_total > 0 else 0.0
        valid_acc  = val_correct / val_total if val_total > 0 else 0.0

        print(
            f"Epoch {epoch+1}/{epochs} | "
            f"Train Loss: {train_loss:.4f}  Acc: {train_acc:.4f} | "
            f"Val Loss: {valid_loss:.4f}  Acc: {valid_acc:.4f}"
        )

        if progress_callback:
            progress_callback(epoch + 1, epochs, train_loss, train_acc,
                              valid_loss, valid_acc)

    # ── 11. Model Kaydetme ───────────────────────────────────────────────────
    checkpoint["model_state_dict"] = model.state_dict()
    torch.save(checkpoint, model_pth_path)
    print(f"Checkpoint kaydedildi: {model_pth_path}")

    # TorchScript FP32
    model.eval()
    model.cpu()
    scripted = torch.jit.script(model)
    scripted.save(str(model_pt_path))
    print(f"FP32 TorchScript kaydedildi: {model_pt_path}")

    # INT8 Quantized
    try:
        quantized_model = torch.quantization.quantize_dynamic(
            model, {nn.Linear}, dtype=torch.qint8
        )
        scripted_quant = torch.jit.script(quantized_model)
        scripted_quant.save(model_quant_path)
        print(f"INT8 Quantized model kaydedildi: {model_quant_path}")
    except Exception as e:
        print(f"Uyarı: Quantized model güncellenemedi: {e}")

    total_samples = len(al_samples) + len(buffer_samples)

    # ── 12. Tarihsel Eğitim Metriklerini Kaydet ──────────────────────────────
    try:
        import datetime
        history_path = os.path.join("outputs", "retrain_history.json")
        history_data = []
        if os.path.exists(history_path):
            with open(history_path, "r", encoding="utf-8") as hf:
                history_data = json.load(hf)
        
        # Yeni eğitim kaydı
        new_entry = {
            "trainedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "epochs": epochs,
            "trainLoss": round(train_loss, 4),
            "trainAcc": round(train_acc, 4),
            "valLoss": round(valid_loss, 4),
            "valAcc": round(valid_acc, 4),
            "totalSamples": total_samples,
            "alSamples": len(al_samples),
            "bufferSamples": len(buffer_samples)
        }
        history_data.append(new_entry)
        
        with open(history_path, "w", encoding="utf-8") as hf:
            json.dump(history_data, hf, ensure_ascii=False, indent=2)
        print(f"Tarihsel eğitim metrikleri kaydedildi: {history_path}")
    except Exception as hex:
        print(f"Uyarı: Tarihsel metrikler kaydedilemedi: {hex}")

    return total_samples
