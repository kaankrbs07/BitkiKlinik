using System.Security.Claims;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

/// <summary>
/// Dashboard verisi sunan ince (thin) controller.
/// Tüm iş mantığı IDashboardService'e delege edilmiştir.
///
/// JWT ile korunur — kullanıcı ID'si token'dan çıkarılır.
/// Bu sayede bir kullanıcı sadece kendi dashboard verisini görebilir.
/// </summary>
[Route("api/[controller]")]
[ApiController]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly IDashboardService _dashboardService;

    public DashboardController(IDashboardService dashboardService)
    {
        _dashboardService = dashboardService;
    }

    // ────────────────────────────────────────────────────────────────
    //  GET  /api/dashboard
    //  → İstatistikler + son 5 tarama kaydı
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Oturum açmış kullanıcının dashboard özetini döndürür.
    /// Toplam/Sağlıklı/Riskli tarama sayıları ve son 5 tarama kaydı içerir.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetDashboard()
    {
        var userId = GetCurrentUserId();

        var summary = await _dashboardService.GetDashboardSummaryAsync(userId);

        return Ok(summary);
    }

    // ────────────────────────────────────────────────────────────────
    //  GET  /api/dashboard/history?page=1&pageSize=10
    //  → Tüm tarama geçmişi (sayfalanmış) — "Tümünü Gör" için
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Kullanıcının tüm tarama geçmişini sayfalanmış olarak döndürür.
    /// Dashboard'daki "Tümünü Gör" butonu için kullanılır.
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetFullHistory(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        var userId = GetCurrentUserId();

        // Tam geçmiş için daha büyük bir recentCount kullanalım
        var summary = await _dashboardService.GetDashboardSummaryAsync(userId, page * pageSize);

        // Sayfalama: atla + al
        var pagedScans = summary.RecentScans
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return Ok(new
        {
            Data       = pagedScans,
            Page       = page,
            PageSize   = pageSize,
            TotalCount = summary.TotalScans
        });
    }

    // ────────────────────────────────────────────────────────────────
    //  Private Helper — JWT'den kullanıcı ID'sini çıkar
    // ────────────────────────────────────────────────────────────────

    private int GetCurrentUserId()
    {
        var nameIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(nameIdClaim) || !int.TryParse(nameIdClaim, out var userId))
            throw new UnauthorizedAccessException("Geçersiz veya eksik kullanıcı kimliği.");

        return userId;
    }
}
