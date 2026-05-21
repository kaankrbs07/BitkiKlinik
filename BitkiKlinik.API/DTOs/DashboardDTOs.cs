namespace BitkiKlinik.API.DTOs;

/// <summary>
/// Dashboard ekranına döndürülen birleşik veri yapısı.
/// İstatistikler + son tarama kayıtlarını tek bir response'ta toplar
/// → Mobil uygulama tek bir HTTP çağrısıyla tüm dashboard verisini alır.
/// </summary>
public class DashboardSummaryDTO
{
    /// <summary>Toplam tarama sayısı</summary>
    public int TotalScans { get; set; }

    /// <summary>"Healthy" statüsündeki tarama sayısı</summary>
    public int HealthyCount { get; set; }

    /// <summary>"Risky" statüsündeki tarama sayısı</summary>
    public int RiskyCount { get; set; }

    /// <summary>Son 5 tarama kaydı (en yeniden eskiye)</summary>
    public List<RecentScanDTO> RecentScans { get; set; } = new();
}

/// <summary>
/// Tek bir tarama kaydının özet bilgisi — dashboard listesinde kullanılır.
/// </summary>
public class RecentScanDTO
{
    public int Id { get; set; }
    public string PlantName { get; set; } = string.Empty;
    public string DiseaseName { get; set; } = string.Empty;
    public float Confidence { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsHealthy { get; set; }
    public DateTime ScanDate { get; set; }
}
