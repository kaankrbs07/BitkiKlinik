using BitkiKlinik.API.Data;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;

namespace BitkiKlinik.API.Services.Implementations;

public class ActiveLearningService : IActiveLearningService
{
    private readonly ApplicationDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _env;
    private readonly IFileStorageService _fileStorageService;
    private readonly ILogger<ActiveLearningService> _logger;
    private readonly IRetrainQueueService? _retrainQueueService;

    public ActiveLearningService(
        ApplicationDbContext context,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IWebHostEnvironment env,
        IFileStorageService fileStorageService,
        ILogger<ActiveLearningService> logger,
        IRetrainQueueService? retrainQueueService = null)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _env = env;
        _fileStorageService = fileStorageService;
        _logger = logger;
        _retrainQueueService = retrainQueueService;
    }

    public async Task EnqueueAsync(int? scanId, string imagePath, string predictedDisease, double confidence, ActiveLearningSource source)
    {
        try
        {
            var fileBytes = await _fileStorageService.GetFileBytesAsync(imagePath);
            string dbPath;
            if (fileBytes != null)
            {
                dbPath = await _fileStorageService.SaveFileBytesAsync(fileBytes, imagePath, "active-learning");
            }
            else
            {
                _logger.LogWarning("Aktif öğrenme için kaynak görsel depolama alanında bulunamadı: {Path}", imagePath);
                dbPath = imagePath; // Fallback
            }

            var queueItem = new ActiveLearningQueue
            {
                ScanId = scanId,
                ImagePath = dbPath,
                PredictedDisease = predictedDisease,
                Confidence = confidence,
                Status = ActiveLearningStatus.Pending,
                Source = source,
                CreatedAt = DateTime.UtcNow
            };

            _context.ActiveLearningQueue.Add(queueItem);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Görsel aktif öğrenme kuyruğuna eklendi: {DbPath}, predicted={Predicted}, source={Source}", 
                dbPath, predictedDisease, source);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Aktif öğrenme kuyruğuna eklenirken hata oluştu.");
            throw;
        }
    }

    public async Task<List<ActiveLearningPendingDTO>> GetPendingAsync(int page, int pageSize)
    {
        return await _context.ActiveLearningQueue
            .Where(q => q.Status == ActiveLearningStatus.Pending)
            .OrderByDescending(q => q.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(q => new ActiveLearningPendingDTO
            {
                Id = q.Id,
                ScanId = q.ScanId,
                ImageUrl = q.ImagePath,
                PredictedDisease = q.PredictedDisease,
                Confidence = q.Confidence,
                Source = q.Source.ToString(),
                CreatedAt = DateTime.SpecifyKind(q.CreatedAt, DateTimeKind.Utc)
            })
            .ToListAsync();
    }

    public async Task<ActiveLearningStatsDTO> GetStatsAsync()
    {
        var stats = await _context.ActiveLearningQueue
            .GroupBy(q => q.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        var pending = stats.FirstOrDefault(s => s.Status == ActiveLearningStatus.Pending)?.Count ?? 0;
        var resolved = stats.FirstOrDefault(s => s.Status == ActiveLearningStatus.Resolved)?.Count ?? 0;
        var ignored = stats.FirstOrDefault(s => s.Status == ActiveLearningStatus.Ignored)?.Count ?? 0;

        return new ActiveLearningStatsDTO
        {
            PendingCount = pending,
            ResolvedCount = resolved,
            TotalCount = pending + resolved + ignored
        };
    }

    public async Task<bool> ResolveAsync(int queueId, string correctedDisease)
    {
        var item = await _context.ActiveLearningQueue.FindAsync(queueId);
        if (item == null) return false;

        item.Status = ActiveLearningStatus.Resolved;
        item.CorrectedDisease = correctedDisease;
        item.ReviewedAt = DateTime.UtcNow;

        // Orijinal tarama kaydını da güncelle (böylece kullanıcının geçmişinde düzelir)
        if (item.ScanId.HasValue)
        {
            try
            {
                var scan = await _context.PlantScans.FindAsync(item.ScanId.Value);
                if (scan != null)
                {
                    // Model etiketini (correctedDisease) veritabanında ara ve insan dostu ismi al
                    var disease = await _context.Diseases.FirstOrDefaultAsync(d => d.ModelLabel == correctedDisease);
                    var diseaseName = disease != null ? disease.Name : correctedDisease;

                    scan.DiseaseName = diseaseName;
                    var isHealthy = diseaseName.Contains("Sağlıklı", StringComparison.OrdinalIgnoreCase)
                                 || diseaseName.Contains("Healthy", StringComparison.OrdinalIgnoreCase)
                                 || correctedDisease.Contains("Sağlıklı", StringComparison.OrdinalIgnoreCase)
                                 || correctedDisease.Contains("Healthy", StringComparison.OrdinalIgnoreCase);
                    scan.Status = isHealthy ? ScanStatus.Healthy : ScanStatus.Risky;
                    _logger.LogInformation("Orijinal tarama kaydı admin kararıyla güncellendi. ScanId: {ScanId}, Yeni Teşhis: {DiseaseName}", item.ScanId.Value, diseaseName);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Orijinal tarama kaydı güncellenirken hata oluştu. ScanId: {ScanId}", item.ScanId.Value);
            }
        }

        await _context.SaveChangesAsync();

        // Python FastAPI ML servisine yeni örneği gönder
        try
        {
            var client = _httpClientFactory.CreateClient("PythonApiClient");
            var fileBytes = await _fileStorageService.GetFileBytesAsync(item.ImagePath);

            if (fileBytes == null)
            {
                _logger.LogError("Aktif öğrenme görseli depolama alanında bulunamadı: {Path}", item.ImagePath);
                return true; // DB'de durumu güncellendiği için true dönüyoruz
            }

            using var formData = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(fileBytes);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");

            formData.Add(fileContent, "file", Path.GetFileName(item.ImagePath));
            formData.Add(new StringContent(correctedDisease), "label");

            var addSampleEndpoint = _configuration["PythonApi:AddSampleEndpoint"] ?? "/active-learning/add-sample";
            var response = await client.PostAsync(addSampleEndpoint, formData);

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                _logger.LogError("FastAPI add-sample servisi hata döndürdü: {Status} - {Error}", response.StatusCode, error);
            }
            else
            {
                _logger.LogInformation("Yeni aktif öğrenme örneği başarıyla Python ML servisine iletildi: label={Label}", correctedDisease);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Aktif öğrenme örneğini Python ML servisine gönderme hatası.");
        }

        return true;
    }

    public async Task<bool> IgnoreAsync(int queueId)
    {
        var item = await _context.ActiveLearningQueue.FindAsync(queueId);
        if (item == null) return false;

        item.Status = ActiveLearningStatus.Ignored;
        item.ReviewedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        _logger.LogInformation("Kuyruk öğesi yoksayıldı: Id={Id}", queueId);
        return true;
    }

    public async Task<bool> FlagScanAsync(int scanId)
    {
        var scan = await _context.PlantScans.FindAsync(scanId);
        if (scan == null) return false;

        // Mükerrer bildirimleri engelle: Eğer bu tarama zaten kuyrukta bekliyorsa (Pending)
        var existingPendingItem = await _context.ActiveLearningQueue
            .FirstOrDefaultAsync(q => q.ScanId == scanId && q.Status == ActiveLearningStatus.Pending);

        if (existingPendingItem != null)
        {
            // Zaten kuyruktaysa, kaynağını "UserFlagged" (kullanıcı bildirmesi) olarak güncelle
            // (Çünkü kullanıcı bildirmesi daha yüksek öncelikli bir inceleme sebebidir)
            if (existingPendingItem.Source != ActiveLearningSource.UserFlagged)
            {
                existingPendingItem.Source = ActiveLearningSource.UserFlagged;
                await _context.SaveChangesAsync();
            }
            return true;
        }

        await EnqueueAsync(
            scanId: scan.Id,
            imagePath: scan.ImageUrl ?? string.Empty,
            predictedDisease: scan.DiseaseName,
            confidence: scan.Confidence,
            source: ActiveLearningSource.UserFlagged
        );

        return true;
    }

    public async Task<RetrainResponseDTO> TriggerRetrainAsync()
    {
        try
        {
            var client = _httpClientFactory.CreateClient("PythonApiClient");

            // ── Önce örnek sayısını kontrol et ───────────────────────────────────
            // 30'dan az örnekle eğitim aşırı öğrenmeye (overfitting) yol açar.
            var retrainStatusEndpoint = _configuration["PythonApi:RetrainStatusEndpoint"] ?? "/active-learning/retrain-status";
            try
            {
                var statusResponse = await client.GetAsync(retrainStatusEndpoint);
                if (statusResponse.IsSuccessStatusCode)
                {
                    var statusJson = await statusResponse.Content.ReadAsStringAsync();
                    var statusDoc  = System.Text.Json.JsonDocument.Parse(statusJson);
                    var totalSamples = statusDoc.RootElement.GetProperty("totalSamples").GetInt32();

                    const int MinSamplesRequired = 30;
                    if (totalSamples < MinSamplesRequired)
                    {
                        _logger.LogWarning(
                            "Yeniden eğitim reddedildi: Yetersiz örnek sayısı. Mevcut: {Current}, Gerekli: {Required}",
                            totalSamples, MinSamplesRequired);

                        return new RetrainResponseDTO
                        {
                            Status  = "insufficient_data",
                            Message = $"Yetersiz aktif öğrenme verisi: {totalSamples} görsel mevcut, " +
                                      $"yeniden eğitim için en az {MinSamplesRequired} doğrulanmış görsel gereklidir. " +
                                      $"({MinSamplesRequired - totalSamples} görsel daha gerekiyor)"
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Retrain-status sorgusu başarısız, doğrudan eğitim tetikleniyor.");
            }

            // ── Eğitimi tetikle ───────────────────────────────────────
            // Önce RabbitMQ kuyruğuna mesaj atmayı dene (çıkarım/eğitim ayrımı).
            // RabbitMQ kullanılamazsa fallback olarak doğrudan Python API'ye HTTP gönder.
            if (_retrainQueueService is not null)
            {
                var isHealthy = await _retrainQueueService.IsHealthyAsync();
                if (isHealthy)
                {
                    var published = await _retrainQueueService.PublishRetrainJobAsync();
                    if (published)
                    {
                        _logger.LogInformation("Yeniden eğitim işi RabbitMQ kuyruğuna eklendi: {Queue}", "bitkiklinik.retrain");
                        return new RetrainResponseDTO
                        {
                            Status  = "queued",
                            Message = "Yeniden eğitim isteği RabbitMQ kuyruğuna eklendi. Worker süreci işlemeye başlayacak."
                        };
                    }
                }
                _logger.LogWarning("RabbitMQ erişilemez durumda. Doğrudan Python API'ye geçiliyor.");
            }

            // Fallback: Doğrudan Python FastAPI'ye HTTP isteği at
            var retrainEndpoint = _configuration["PythonApi:RetrainEndpoint"] ?? "/active-learning/retrain";
            
            var response = await client.PostAsync(retrainEndpoint, null);

            if (response.IsSuccessStatusCode)
            {
                return new RetrainResponseDTO
                {
                    Status = "started",
                    Message = "Model fine-tuning arka planda başlatıldı (doğrudan Python API)."
                };
            }
            else
            {
                var error = await response.Content.ReadAsStringAsync();
                return new RetrainResponseDTO
                {
                    Status = "failed",
                    Message = $"Python ML Servisi hata döndürdü: {response.StatusCode}. Detay: {error}"
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Python ML Servisinde yeniden eğitimi tetiklerken hata oluştu.");
            return new RetrainResponseDTO
            {
                Status = "failed",
                Message = $"Yeniden eğitim tetiklenemedi: {ex.Message}"
            };
        }
    }

    /// <inheritdoc />
    public async Task<RetrainStatusDTO?> GetRetrainStatusAsync()
    {
        try
        {
            var client = _httpClientFactory.CreateClient("PythonApiClient");
            var endpoint = _configuration["PythonApi:RetrainStatusEndpoint"] ?? "/active-learning/retrain-status";
            
            var response = await client.GetAsync(endpoint);
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                var status = System.Text.Json.JsonSerializer.Deserialize<RetrainStatusDTO>(content, new System.Text.Json.JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return status;
            }
            else
            {
                _logger.LogWarning("Python ML Servisinden retrain status alınamadı. Kod: {StatusCode}", response.StatusCode);
                return null;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetRetrainStatusAsync çalışırken hata oluştu.");
            return null;
        }
    }

    /// <inheritdoc />
    public async Task BackupModelToB2Async()
    {
        var provider = _configuration["FileStorage:Provider"];
        if (provider != "Backblaze")
        {
            _logger.LogInformation("Depolama sağlayıcısı Backblaze olmadığından model bulut yedeklemesi atlandı.");
            return;
        }

        _logger.LogInformation("Yeni eğitilen yapay zeka model dosyaları Backblaze B2 bulut sunucusuna yedekleniyor...");
        var client = _httpClientFactory.CreateClient("PythonApiClient");
        var filesToBackup = new[] { "efficientnet_b0_plant.pt", "efficientnet_b0_plant.quant.pt", "class_map.json" };
        
        foreach (var fileName in filesToBackup)
        {
            try
            {
                var downloadUrl = $"/active-learning/download-model/{fileName}";
                var response = await client.GetAsync(downloadUrl);
                if (response.IsSuccessStatusCode)
                {
                    var fileBytes = await response.Content.ReadAsByteArrayAsync();
                    // Buluta "models/latest" alt klasörü altında kaydederiz
                    await _fileStorageService.SaveFileBytesAsync(fileBytes, fileName, "models/latest");
                    _logger.LogInformation("Model dosyası başarıyla Backblaze B2'ye yedeklendi: {File}", fileName);
                }
                else
                {
                    _logger.LogWarning("Model dosyası indirilemediği için yedeklenemedi: {File}. Durum: {Status}", fileName, response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Model dosyası B2'ye yedeklenirken hata oluştu: {File}", fileName);
            }
        }
    }

    // ── Özel yardımcı metodlar ────────────────────────────────────────────────
    
    private string GetPhysicalPath(string url)
    {
        var rel = url.TrimStart('/');
        if (rel.StartsWith("wwwroot"))
        {
            return Path.Combine(_env.ContentRootPath, rel);
        }
        return Path.Combine(_env.ContentRootPath, "wwwroot", rel);
    }
}
