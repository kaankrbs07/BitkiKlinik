using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Bitki görseli analiz iş akışını yönetir:
/// 1. Görseli yerel diske kaydeder
/// 2. Python AI mikroservisine iletir
/// 3. Birleşik sonucu döndürür
/// </summary>
public interface IPlantAnalysisService
{
    /// <summary>
    /// Mobil istemciden gelen görsel dosyasını işler.
    /// </summary>
    /// <param name="image">Controller'dan gelen IFormFile nesnesi</param>
    /// <returns>Tahmin etiketi, güven skoru ve görsel URL'ini içeren sonuç</returns>
    Task<PlantAnalysisResultDTO> AnalyzeAsync(IFormFile image);
}
