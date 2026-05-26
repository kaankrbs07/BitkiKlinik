using System.Security.Claims;
using BitkiKlinik.API.Configuration;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class DiseasesController : ControllerBase
{
    private readonly IDiseaseService _diseaseService;
    private readonly ITreatmentService _treatmentService;
    private readonly IPlantAnalysisService _plantAnalysisService;
    private readonly IScanService _scanService;
    private readonly IActiveLearningService _activeLearningService;
    private readonly ILogger<DiseasesController> _logger;

    public DiseasesController(
        IDiseaseService diseaseService,
        ITreatmentService treatmentService,
        IPlantAnalysisService plantAnalysisService,
        IScanService scanService,
        IActiveLearningService activeLearningService,
        ILogger<DiseasesController> logger)
    {
        _diseaseService       = diseaseService;
        _treatmentService     = treatmentService;
        _plantAnalysisService = plantAnalysisService;
        _scanService          = scanService;
        _activeLearningService = activeLearningService;
        _logger               = logger;
    }

    /// <summary>
    /// Tüm hastalıkları ve bunlara ait doğal/kimyasal tedavileri listeler.
    /// Bitki Hastalıkları Ansiklopedisi (Tıbbi Rehber) için kullanılır.
    /// </summary>
    /// <remarks>
    /// Tek bir SQL sorgusu (Include + ThenInclude) kullanır — N+1 yok.
    /// </remarks>
    [HttpGet]
    public async Task<IActionResult> GetAllDiseases()
    {
        var result = await _diseaseService.GetAllWithTreatmentsAsync();
        return Ok(result);
    }


    /// <summary>
    /// Hastalık adına göre hastalık ve tedavi bilgilerini döndürür.
    /// Geçmiş taramaların detaylarını görüntülemek için kullanılır.
    /// </summary>
    [HttpGet("by-name/{diseaseName}")]
    public async Task<IActionResult> GetDiseaseByName(string diseaseName)
    {
        try
        {
            var disease = (await _diseaseService.FindAsync(d => d.Name == diseaseName)).FirstOrDefault();

            if (disease == null)
                return NotFound(new { Message = "Bu isimle eşleşen bir hastalık bulunamadı." });

            var treatments = await _treatmentService.GetTreatmentsByDiseaseIdAsync(disease.Id);

            return Ok(new
            {
                Disease = new DiseaseDTO
                {
                    Id          = disease.Id,
                    Name        = disease.Name,
                    Description = disease.Description
                },
                Treatments = treatments,
                Confidence = 1.0, // Varsayılan güven skoru
                ImageUrl = (string?)null // Görsel geçmiş kaydından alınacak
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { Message = "Hastalık bilgisi aranırken bir hata oluştu.", Error = ex.Message });
        }
    }

    /// <summary>
    /// Mobil uygulamadan gelen bitki görselini analiz eder:
    /// görseli kaydeder → Python AI'ya gönderir → hastalık + tedavi bilgisini döndürür.
    /// </summary>
    [HttpPost("scan")]
    public async Task<IActionResult> ScanPlantImage(IFormFile image)
    {
        if (image == null || image.Length == 0)
            return BadRequest(new { Message = "Lütfen geçerli bir bitki fotoğrafı yükleyin." });

        try
        {
            // 1. Görseli kaydet + Python'a ilet → etiket, güven skoru, görsel URL
            var analysisResult = await _plantAnalysisService.AnalyzeAsync(image);

            // 2. Etiketi veritabanında ara
            var disease = await _diseaseService.GetByModelLabelAsync(analysisResult.ModelLabel);

            if (disease == null)
            {
                return NotFound(new
                {
                    Message    = $"Yapay zeka bu bitkiyi '{analysisResult.ModelLabel}' olarak tanımladı ancak veritabanımızda eşleşen hastalık bulunamadı.",
                    ModelLabel = analysisResult.ModelLabel,
                    Confidence = analysisResult.Confidence,
                    ImageUrl   = analysisResult.ImageUrl
                });
            }

            // 3. Hastalığa ait tedavileri getir
            var treatments = await _treatmentService.GetTreatmentsByDiseaseIdAsync(disease.Id);

            // 4. Tarama sonucunu veritabanına kaydet (dashboard için)
            var userId = GetCurrentUserId();
            var isHealthy = disease.Name.Contains("Sağlıklı", StringComparison.OrdinalIgnoreCase)
                         || disease.Name.Contains("Healthy", StringComparison.OrdinalIgnoreCase);

            var plantScan = new PlantScan
            {
                UserId      = userId,
                PlantName   = ExtractPlantName(analysisResult.ModelLabel),
                DiseaseName = disease.Name,
                Confidence  = analysisResult.Confidence,
                ImageUrl    = analysisResult.ImageUrl,
                Status      = isHealthy ? ScanStatus.Healthy : ScanStatus.Risky,
                ScanDate    = DateTime.UtcNow
            };
            await _scanService.SaveScanAsync(plantScan);

            // 4.5 Düşük güven durumunda aktif öğrenme kuyruğuna otomatik ekle
            if (analysisResult.Confidence < GlobalConstants.ActiveLearningThreshold)
            {
                try
                {
                    await _activeLearningService.EnqueueAsync(
                        scanId: plantScan.Id,
                        imagePath: plantScan.ImageUrl ?? string.Empty,
                        predictedDisease: plantScan.DiseaseName,
                        confidence: plantScan.Confidence,
                        source: Models.Enums.ActiveLearningSource.LowConfidence
                    );
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Düşük güvenli tarama aktif öğrenme kuyruğuna eklenirken hata oluştu. ScanId: {ScanId}", plantScan.Id);
                }
            }

            // 5. Birleşik sonucu döndür
            return Ok(new
            {
                Disease = new DiseaseDTO
                {
                    Id          = disease.Id,
                    Name        = disease.Name,
                    Description = disease.Description
                },
                Treatments = treatments,
                Confidence = analysisResult.Confidence,
                ImageUrl   = analysisResult.ImageUrl,
                ScanId     = plantScan.Id
            });
        }
        catch (ArgumentException ex)
        {
            // Dosya validasyon hatası (boyut, uzantı vb.)
            return BadRequest(new { Message = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(503, new { Message = "Yapay zeka analiz sunucusuna şu anda ulaşılamıyor.", Error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { Message = "Analiz sırasında beklenmeyen bir hata oluştu.", Error = ex.Message });
        }
    }

    [HttpGet("analyze/{modelLabel}")]
    public async Task<IActionResult> GetDiseaseByModelLabel(string modelLabel)
    {
        var disease = await _diseaseService.GetByModelLabelAsync(modelLabel);

        if (disease == null)
            return NotFound(new { Message = "Bu etiketle eşleşen bir hastalık bulunamadı." });

        return Ok(new DiseaseDTO
        {
            Id          = disease.Id,
            Name        = disease.Name,
            Description = disease.Description
        });
    }

    [HttpGet("{diseaseId}/treatments")]
    public async Task<IActionResult> GetDiseaseTreatments(int diseaseId)
    {
        var treatments = await _treatmentService.GetTreatmentsByDiseaseIdAsync(diseaseId);

        if (!treatments.NaturalTreatments.Any() && !treatments.ChemicalTreatments.Any())
            return NotFound(new { Message = "Bu hastalık için henüz bir tedavi önerisi eklenmemiş." });

        return Ok(treatments);
    }

    [HttpPost("{scanId}/flag")]
    public async Task<IActionResult> FlagScan(int scanId, [FromBody] FlagScanDTO? dto)
    {
        var success = await _activeLearningService.FlagScanAsync(scanId);
        if (!success)
            return NotFound(new { message = "Tarama bulunamadı." });
        _logger.LogInformation("Tarama {ScanId} kullanıcı tarafından yanlış teşhis olarak bildirildi.", scanId);
        return Ok(new { message = "Teşhis bildirimi başarıyla kaydedildi." });
    }

    // ── Private Helpers ──────────────────────────────────────────────

    private int GetCurrentUserId()
    {
        var nameIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(nameIdClaim) || !int.TryParse(nameIdClaim, out var userId))
            throw new UnauthorizedAccessException("Geçersiz veya eksik kullanıcı kimliği.");
        return userId;
    }

    /// <summary>
    /// Model etiketinden bitki adını çıkarır.
    /// "Tomato__Blight" → "Tomato", "Potato___healthy" → "Potato"
    /// </summary>
    private static string ExtractPlantName(string modelLabel)
    {
        // ModelLabel formatı: "BitkiAdı__HastalıkAdı" veya "BitkiAdı___healthy"
        var separators = new[] { "___", "__" };
        foreach (var sep in separators)
        {
            var idx = modelLabel.IndexOf(sep, StringComparison.Ordinal);
            if (idx > 0)
                return modelLabel[..idx].Replace('_', ' ').Trim();
        }
        return modelLabel.Replace('_', ' ').Trim();
    }
}
