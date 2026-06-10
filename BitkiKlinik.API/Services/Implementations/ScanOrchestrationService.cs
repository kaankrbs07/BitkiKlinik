using BitkiKlinik.API.Configuration;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// Bitki taraması iş akışını koordine eden servis.
/// DiseasesController'dan taşınan iş mantığı burada merkezi olarak yönetilir:
///   1. Hastalık eşleştirme (model etiketi → DB kaydı)
///   2. Tedavi getirme
///   3. PlantScan kaydı oluşturma
///   4. Düşük güvenli tahminleri aktif öğrenme kuyruğuna ekleme
/// </summary>
public class ScanOrchestrationService : IScanOrchestrationService
{
    private readonly IDiseaseService _diseaseService;
    private readonly ITreatmentService _treatmentService;
    private readonly IScanService _scanService;
    private readonly IActiveLearningService _activeLearningService;
    private readonly ILogger<ScanOrchestrationService> _logger;

    public ScanOrchestrationService(
        IDiseaseService diseaseService,
        ITreatmentService treatmentService,
        IScanService scanService,
        IActiveLearningService activeLearningService,
        ILogger<ScanOrchestrationService> logger)
    {
        _diseaseService       = diseaseService;
        _treatmentService     = treatmentService;
        _scanService          = scanService;
        _activeLearningService = activeLearningService;
        _logger               = logger;
    }

    /// <inheritdoc />
    public async Task<ScanOrchestrationResultDTO> ProcessScanAsync(
        PlantAnalysisResultDTO analysisResult,
        int userId)
    {
        // 1. Model etiketini veritabanında ara
        var disease = await _diseaseService.GetByModelLabelAsync(analysisResult.ModelLabel)
            ?? throw new KeyNotFoundException(
                $"Model etiketi '{analysisResult.ModelLabel}' veritabanında bulunamadı.");

        // 2. Hastalığa ait tedavileri getir
        var treatments = await _treatmentService.GetTreatmentsByDiseaseIdAsync(disease.Id);

        // 3. Sağlıklı / riskli durumunu belirle
        var isHealthy = disease.Name.Contains("Sağlıklı", StringComparison.OrdinalIgnoreCase)
                     || disease.Name.Contains("Healthy", StringComparison.OrdinalIgnoreCase);

        // 4. Tarama kaydını oluştur ve kaydet
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

        // 5. Düşük güven durumunda aktif öğrenme kuyruğuna ekle
        if (analysisResult.Confidence < GlobalConstants.ActiveLearningThreshold)
        {
            try
            {
                await _activeLearningService.EnqueueAsync(
                    scanId          : plantScan.Id,
                    imagePath       : plantScan.ImageUrl ?? string.Empty,
                    predictedDisease: analysisResult.ModelLabel,
                    confidence      : plantScan.Confidence,
                    source          : ActiveLearningSource.LowConfidence
                );
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Düşük güvenli tarama aktif öğrenme kuyruğuna eklenirken hata oluştu. ScanId: {ScanId}",
                    plantScan.Id);
            }
        }

        // 6. Birleşik sonucu döndür
        return new ScanOrchestrationResultDTO(
            Disease    : new DiseaseDTO { Id = disease.Id, Name = disease.Name, Description = disease.Description },
            Treatments : treatments,
            Confidence : analysisResult.Confidence,
            ImageUrl   : analysisResult.ImageUrl,
            ScanId     : plantScan.Id
        );
    }

    // ── Özel Yardımcılar ──────────────────────────────────────────────────────

    private static readonly Dictionary<string, string> PlantNameTranslations = new(StringComparer.OrdinalIgnoreCase)
    {
        { "Apple", "Elma" },
        { "Cassava", "Manyok" },
        { "Cherry", "Kiraz" },
        { "Chili", "Biber" },
        { "Coffee", "Kahve" },
        { "Corn", "Mısır" },
        { "Cucumber", "Salatalık" },
        { "Gauva", "Guava" },
        { "Guava", "Guava" },
        { "Grape", "Üzüm" },
        { "Jamun", "Jamun" },
        { "Lemon", "Limon" },
        { "Mango", "Mango" },
        { "Peach", "Şeftali" },
        { "Pepper_bell", "Dolmalık Biber" },
        { "Pomegranate", "Nar" },
        { "Potato", "Patates" },
        { "Rice", "Pirinç" },
        { "Soybean", "Soya" },
        { "Strawberry", "Çilek" },
        { "Sugarcane", "Şeker Kamışı" },
        { "Tea", "Çay" },
        { "Tomato", "Domates" },
        { "Wheat", "Buğday" }
    };

    /// <summary>
    /// Model etiketinden bitki adını çıkarır ve Türkçe karşılığını döner.
    /// "Tomato__Blight" → "Domates",  "Potato___healthy" → "Patates"
    /// </summary>
    private static string ExtractPlantName(string modelLabel)
    {
        string englishName = modelLabel;
        var separators = new[] { "___", "__" };
        
        foreach (var sep in separators)
        {
            var idx = modelLabel.IndexOf(sep, StringComparison.Ordinal);
            if (idx > 0)
            {
                englishName = modelLabel[..idx];
                break;
            }
        }

        // Türkçe karşılığını ara, yoksa temizlenmiş İngilizce ismi dön
        if (PlantNameTranslations.TryGetValue(englishName, out var turkishName))
        {
            return turkishName;
        }

        return System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(
            englishName.Replace('_', ' ').Trim().ToLower()
        );
    }
}
