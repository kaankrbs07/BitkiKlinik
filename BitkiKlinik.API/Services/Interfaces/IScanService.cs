using BitkiKlinik.API.Models;

namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Tarama sonuçlarını veritabanına kaydetmekten sorumlu arayüz.
/// DiseasesController → IScanService → PlantScans tablosu.
/// </summary>
public interface IScanService
{
    /// <summary>
    /// Yeni bir tarama kaydını veritabanına ekler.
    /// </summary>
    Task<PlantScan> SaveScanAsync(PlantScan scan);
}
