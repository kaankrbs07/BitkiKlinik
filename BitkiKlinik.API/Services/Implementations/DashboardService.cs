using BitkiKlinik.API.Data;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// Dashboard iş mantığını yürütür.
/// Doğrudan DbContext kullanarak optimize edilmiş sorgular çalıştırır.
///
/// Neden IUserService yerine doğrudan DbContext?
/// → Dashboard, Users tablosuyla değil PlantScans ile çalışır.
///   Aggregate count sorguları generic service üzerinden verimsiz olurdu.
///   Bu yaklaşım tek bir SQL sorgusuyla tüm istatistikleri getirir.
/// </summary>
public class DashboardService : IDashboardService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<DashboardService> _logger;

    public DashboardService(ApplicationDbContext context, ILogger<DashboardService> logger)
    {
        _context = context;
        _logger  = logger;
    }

    /// <inheritdoc />
    public async Task<DashboardSummaryDTO> GetDashboardSummaryAsync(int userId, int recentCount = 5)
    {
        // ── 1. Tüm istatistikleri tek sorguda hesapla ────────────────────
        // GroupBy yerine basit count sorguları — EF Core LINQ-to-SQL uyumlu
        var userScans = _context.PlantScans
            .Where(ps => ps.UserId == userId);

        var totalScans   = await userScans.CountAsync();
        var healthyCount = await userScans.CountAsync(ps => ps.Status == ScanStatus.Healthy);
        var riskyCount   = await userScans.CountAsync(ps => ps.Status == ScanStatus.Risky);

        // ── 2. Son N tarama kaydını getir (en yeniden eskiye) ─────────────
        var recentScans = await userScans
            .OrderByDescending(ps => ps.ScanDate)
            .Take(recentCount)
            .Select(ps => new RecentScanDTO
            {
                Id          = ps.Id,
                PlantName   = ps.PlantName,
                DiseaseName = ps.DiseaseName,
                Confidence  = ps.Confidence,
                ImageUrl    = ps.ImageUrl,
                IsHealthy   = ps.Status == ScanStatus.Healthy,
                ScanDate    = ps.ScanDate
            })
            .ToListAsync();

        _logger.LogInformation(
            "Dashboard verisi hazırlandı → UserId: {UserId}, Toplam: {Total}, Sağlıklı: {Healthy}, Riskli: {Risky}",
            userId, totalScans, healthyCount, riskyCount);

        // ── 3. Birleşik DTO'yu döndür ────────────────────────────────────
        return new DashboardSummaryDTO
        {
            TotalScans   = totalScans,
            HealthyCount = healthyCount,
            RiskyCount   = riskyCount,
            RecentScans  = recentScans
        };
    }
}
