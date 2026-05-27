using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Bitki taraması iş akışını koordine eder:
/// hastalık eşleştirme → tedavi getirme → tarama kaydetme → aktif öğrenme kuyruğu.
/// DiseasesController'ı ince bir HTTP katmanına indirger.
/// </summary>
public interface IScanOrchestrationService
{
    /// <summary>
    /// AI analiz sonucunu alarak hastalık, tedavi, kayıt ve aktif öğrenme
    /// adımlarını tek seferde gerçekleştirir.
    /// </summary>
    /// <param name="analysisResult">PlantAnalysisService'ten gelen ham analiz sonucu.</param>
    /// <param name="userId">Taramayı yapan kullanıcının ID'si.</param>
    /// <returns>Controller'ın istemciye döndüreceği birleşik tarama sonucu.</returns>
    Task<ScanOrchestrationResultDTO> ProcessScanAsync(PlantAnalysisResultDTO analysisResult, int userId);
}
