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
    private readonly ILogger<ActiveLearningService> _logger;

    public ActiveLearningService(
        ApplicationDbContext context,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IWebHostEnvironment env,
        ILogger<ActiveLearningService> logger)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _env = env;
        _logger = logger;
    }

    public async Task EnqueueAsync(int? scanId, string imagePath, string predictedDisease, double confidence, ActiveLearningSource source)
    {
        try
        {
            var relativeFolder = "uploads/active-learning";
            var physicalFolder = Path.Combine(_env.ContentRootPath, "wwwroot", relativeFolder);
            
            if (!Directory.Exists(physicalFolder))
            {
                Directory.CreateDirectory(physicalFolder);
            }

            var extension = Path.GetExtension(imagePath).ToLowerInvariant();
            if (string.IsNullOrEmpty(extension))
            {
                extension = ".jpg";
            }
            
            var uniqueName = $"{Guid.NewGuid()}{extension}";
            var physicalDest = Path.Combine(physicalFolder, uniqueName);

            var physicalSource = GetPhysicalPath(imagePath);
            if (File.Exists(physicalSource))
            {
                File.Copy(physicalSource, physicalDest, true);
            }
            else
            {
                _logger.LogWarning("Aktif öğrenme için kaynak görsel fiziksel olarak bulunamadı: {Path}", physicalSource);
            }

            var dbPath = $"/uploads/active-learning/{uniqueName}";

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
                CreatedAt = q.CreatedAt
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

        await _context.SaveChangesAsync();

        // Python FastAPI ML servisine yeni örneği gönder
        try
        {
            var client = _httpClientFactory.CreateClient("PythonApiClient");
            var physicalPath = GetPhysicalPath(item.ImagePath);

            if (!File.Exists(physicalPath))
            {
                _logger.LogError("Aktif öğrenme görseli fiziksel yolda bulunamadı: {Path}", physicalPath);
                return true; // DB'de durumu güncellendiği için true dönüyoruz
            }

            using var formData = new MultipartFormDataContent();
            var fileBytes = await File.ReadAllBytesAsync(physicalPath);
            var fileContent = new ByteArrayContent(fileBytes);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");

            formData.Add(fileContent, "file", Path.GetFileName(physicalPath));
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

        // Mükerrer bildirimleri engelle
        var exists = await _context.ActiveLearningQueue.AnyAsync(q => q.ScanId == scanId && q.Source == ActiveLearningSource.UserFlagged);
        if (exists) return true;

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
            var retrainEndpoint = _configuration["PythonApi:RetrainEndpoint"] ?? "/active-learning/retrain";
            
            var response = await client.PostAsync(retrainEndpoint, null);

            if (response.IsSuccessStatusCode)
            {
                return new RetrainResponseDTO
                {
                    Status = "started",
                    Message = "Model fine-tuning arka planda başlatıldı."
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
