using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Dashboard iş mantığını soyutlayan arayüz.
/// Tarama istatistikleri ve son tarama kayıtlarını sorgular.
/// </summary>
public interface IDashboardService
{
    /// <summary>
    /// Belirli bir kullanıcı için dashboard özet verisini döndürür:
    /// toplam/sağlıklı/riskli tarama sayıları + son N tarama kaydı.
    /// </summary>
    /// <param name="userId">JWT'den alınan kullanıcı ID'si</param>
    /// <param name="recentCount">Getirilecek son tarama sayısı (varsayılan: 5)</param>
    Task<DashboardSummaryDTO> GetDashboardSummaryAsync(int userId, int recentCount = 5);
}
