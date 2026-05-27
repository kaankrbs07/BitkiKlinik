import os
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from PIL import Image
import torchvision.models as models
from torchvision import transforms

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

def retrain_model(progress_callback=None):
    # Paths
    data_dir = "data/active_learning"
    class_map_path = "outputs/class_map.json"
    model_pth_path = "outputs/efficientnet_b0_plant.pth"
    model_pt_path = "outputs/efficientnet_b0_plant.pt"
    
    # 1. Load class map
    if not os.path.exists(class_map_path):
        raise FileNotFoundError(f"Sınıf haritası bulunamadı: {class_map_path}")
    with open(class_map_path, "r", encoding="utf-8") as f:
        class_map = json.load(f)
    
    class_to_idx = {v: int(k) for k, v in class_map.items()}
    
    # 2. Gather samples
    all_samples = []
    if os.path.exists(data_dir):
        for label in os.listdir(data_dir):
            label_dir = os.path.join(data_dir, label)
            if os.path.isdir(label_dir):
                if label not in class_to_idx:
                    print(f"Uyarı: '{label}' etiket sınıf haritasında bulunamadı, atlanıyor.")
                    continue
                class_idx = class_to_idx[label]
                for fname in os.listdir(label_dir):
                    if fname.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                        all_samples.append((os.path.join(label_dir, fname), class_idx))
                        
    # ── Minimum Örnek Sayısı Kontrolü ────────────────────────────────────
    # Model fine-tuning'in anlamlı sonuç vermesi için en az MIN_SAMPLES
    # etiketlenmiş görsele ihtiyaç vardır. Bu değerin altında eğitim
    # başlatmak aşırı öğrenmeye (overfitting) yol açar.
    MIN_SAMPLES = 30

    if not all_samples:
        raise ValueError(
            "Yeniden eğitim için aktif öğrenme veri setinde hiç görsel bulunamadı. "
            "Lütfen önce admin panelinden en az 1 teşhisi doğrulayın."
        )

    if len(all_samples) < MIN_SAMPLES:
        raise ValueError(
            f"Yetersiz aktif öğrenme verisi: {len(all_samples)} görsel mevcut, "
            f"yeniden eğitim için en az {MIN_SAMPLES} doğrulanmış görsel gereklidir. "
            f"({MIN_SAMPLES - len(all_samples)} görsel daha gerekiyor)"
        )
        
    # Shuffle and split
    import random
    random.shuffle(all_samples)
    
    val_split = 0.2
    if len(all_samples) >= 5:
        split_idx = int(len(all_samples) * (1 - val_split))
        train_samples = all_samples[:split_idx]
        val_samples = all_samples[split_idx:]
    else:
        # Örnek sayısı yetersizse hepsini hem eğitime hem doğrulamaya koy
        train_samples = all_samples
        val_samples = all_samples
        
    # Preprocessing & Data Augmentations
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.8, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    val_transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    train_dataset = ActiveLearningDataset(train_samples, transform=train_transform)
    val_dataset = ActiveLearningDataset(val_samples, transform=val_transform)
    
    # Batch size (küçük veriler için dinamik ve güvenli)
    batch_size = min(8, len(train_samples))
    if batch_size < 1:
        batch_size = 1
        
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, drop_last=False)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, drop_last=False)
    
    # 3. Model Yükleme
    if not os.path.exists(model_pth_path):
        raise FileNotFoundError(f"Temel model ağırlıkları bulunamadı: {model_pth_path}")
        
    checkpoint = torch.load(model_pth_path, map_location="cpu")
    num_classes = checkpoint["num_classes"]
    
    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(1280, num_classes)
    model.load_state_dict(checkpoint["model_state_dict"])
    
    # Device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    
    # 4. Katman Dondurma (~70% features frozen)
    # features.0 ile features.5 arasındaki blokları donduruyoruz.
    # features.6, features.7, features.8 ve classifier eğitilebilir kalıyor.
    for name, param in model.named_parameters():
        if any(f"features.{i}." in name for i in range(6)):
            param.requires_grad = False
        else:
            param.requires_grad = True
            
    # Optimizer & Kayıp Fonksiyonu
    optimizer = optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-5, weight_decay=1e-4)
    criterion = nn.CrossEntropyLoss()
    
    epochs = 10
    
    for epoch in range(epochs):
        # Eğitim
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0
        
        for images, targets in train_loader:
            images, targets = images.to(device), targets.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item() * images.size(0)
            _, predicted = outputs.max(1)
            total += targets.size(0)
            correct += predicted.eq(targets).sum().item()
            
        train_loss = running_loss / total if total > 0 else 0
        train_acc = correct / total if total > 0 else 0
        
        # Doğrulama
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0
        
        with torch.no_grad():
            for images, targets in val_loader:
                images, targets = images.to(device), targets.to(device)
                outputs = model(images)
                loss = criterion(outputs, targets)
                val_loss += loss.item() * images.size(0)
                _, predicted = outputs.max(1)
                val_total += targets.size(0)
                val_correct += predicted.eq(targets).sum().item()
                
        valid_loss = val_loss / val_total if val_total > 0 else 0
        valid_acc = val_correct / val_total if val_total > 0 else 0
        
        print(f"Epoch {epoch+1}/{epochs} - Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f} - Val Loss: {valid_loss:.4f}, Val Acc: {valid_acc:.4f}")
        
        if progress_callback:
            progress_callback(epoch + 1, epochs, train_loss, train_acc, valid_loss, valid_acc)
            
    # Güncellenmiş ağırlıkları .pth olarak kaydet
    checkpoint["model_state_dict"] = model.state_dict()
    torch.save(checkpoint, model_pth_path)
    
    # TorchScript FP32 modelini kaydet (CPU'ya çekerek cihazdan bağımsız yapıyoruz)
    model.eval()
    model.cpu()
    scripted = torch.jit.script(model)
    scripted.save(str(model_pt_path))
    print(f"FP32 modeli TorchScript olarak kaydedildi: {model_pt_path}")
    
    # Eğer INT8 quantize modeli varsa onu da FP32 scripted ile değiştir (CPU fallback'te yeniyi yüklesin diye)
    model_quant_path = "outputs/efficientnet_b0_plant.quant.pt"
    if os.path.exists(model_quant_path):
        try:
            scripted.save(model_quant_path)
            print(f"INT8/Quantized modeli yeni ağırlıklarla güncellendi: {model_quant_path}")
        except Exception as e:
            print("Hata: Quantized model güncellenemedi, siliniyor:", e)
            os.remove(model_quant_path)
            
    return len(all_samples)
