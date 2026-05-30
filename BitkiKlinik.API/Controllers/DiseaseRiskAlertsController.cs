using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Implementations;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BitkiKlinik.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class DiseaseRiskAlertsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IWeatherService _weatherService;
    private readonly ILogger<DiseaseRiskAlertsController> _logger;

    public DiseaseRiskAlertsController(
        ApplicationDbContext context,
        IWeatherService weatherService,
        ILogger<DiseaseRiskAlertsController> logger)
    {
        _context = context;
        _weatherService = weatherService;
        _logger = logger;
    }

    /// <summary>
    /// Kullanıcının konumuna göre hesaplanmış en son mantarsal hastalık riskini döner.
    /// </summary>
    [HttpGet("latest")]
    public async Task<IActionResult> GetLatestAlert()
    {
        try
        {
            var userId = GetCurrentUserId();

            var latestAlert = await _context.DiseaseRiskAlerts
                .Where(a => a.UserId == userId)
                .OrderByDescending(a => a.CalculatedAt)
                .FirstOrDefaultAsync();

            if (latestAlert == null)
            {
                // Konum bilgisi yoksa veya henüz risk hesaplanmadıysa varsayılan güvenli nesne dönüyoruz
                return Ok(new
                {
                    DiseaseName = "Mildiyö (Geç Yanıklık)",
                    RiskPercentage = 0.0f,
                    RiskLevel = "Düşük",
                    Suggestion = "Konumunuz güncellendiğinde tarımsal risk analiziniz otomatik olarak hesaplanacaktır.",
                    CalculatedAt = DateTime.UtcNow
                });
            }

            latestAlert.CalculatedAt = DateTime.SpecifyKind(latestAlert.CalculatedAt, DateTimeKind.Utc);
            return Ok(latestAlert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Son hastalık riski çekilirken hata oluştu.");
            return StatusCode(500, new { Message = "Hastalık riski uyarısı alınamadı.", Error = ex.Message });
        }
    }

    /// <summary>
    /// Mobil uygulamadan gelen GPS koordinatlarını ve Expo Push Token'ı kaydeder.
    /// </summary>
    [HttpPost("~/api/Users/location")]
    public async Task<IActionResult> UpdateUserLocation([FromBody] UserLocationUpdateDto request)
    {
        if (request == null)
            return BadRequest(new { Message = "Konum parametreleri boş olamaz." });

        try
        {
            var userId = GetCurrentUserId();
            var user = await _context.Users.FindAsync(userId);

            if (user == null)
                return NotFound(new { Message = "Kullanıcı bulunamadı." });

            user.Latitude = request.Latitude;
            user.Longitude = request.Longitude;

            if (!string.IsNullOrEmpty(request.ExpoPushToken))
            {
                user.ExpoPushToken = request.ExpoPushToken;
            }

            _context.Users.Update(user);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Kullanıcı {UserId} konumu güncellendi. Lat: {Lat}, Lon: {Lon}", 
                userId, request.Latitude, request.Longitude);

            // ─── 15 Dakikalık Önbellek Kontrolü (Throttling) ───
            var latestAlert = await _context.DiseaseRiskAlerts
                .Where(a => a.UserId == userId)
                .OrderByDescending(a => a.CalculatedAt)
                .FirstOrDefaultAsync();

            if (latestAlert != null && DateTime.UtcNow - latestAlert.CalculatedAt < TimeSpan.FromMinutes(15))
            {
                _logger.LogInformation("Kullanıcı {UserId} için son 15 dakika içinde risk analizi yapılmış. Hava durumu servisi çağrılmadı, önbellek kullanıldı.", userId);
                return Ok(new
                {
                    Message = "Konum bilgileri başarıyla güncellendi. Son 15 dakika içinde hesaplama yapıldığı için önbellekteki veri kullanıldı.",
                    LatestRisk = new
                    {
                        latestAlert.DiseaseName,
                        latestAlert.RiskPercentage,
                        latestAlert.RiskLevel,
                        latestAlert.Suggestion,
                        CalculatedAt = DateTime.SpecifyKind(latestAlert.CalculatedAt, DateTimeKind.Utc)
                    }
                });
            }

            // UX Geliştirmesi: Kullanıcı konumunu güncellediğinde, arka plan servisini beklemeden
            // anında hava durumu tahminini çekip riskini hesaplayalım ve veritabanına ekleyelim.
            float newRiskPercentage = 0.0f;
            string newRiskLevel = "Düşük";
            string newSuggestion = "Hava tahmin verileri hesaplanıyor...";

            var forecast = await _weatherService.GetHourlyForecastAsync(request.Latitude, request.Longitude);
            if (forecast != null)
            {
                var result = DiseaseRiskCalculator.CalculateMildewRisk(forecast);
                newRiskPercentage = result.RiskPercentage;
                newRiskLevel = result.RiskLevel;
                newSuggestion = result.Suggestion;

                var existingAlert = await _context.DiseaseRiskAlerts
                    .FirstOrDefaultAsync(a => a.UserId == userId && a.DiseaseName == "Mildiyö (Geç Yanıklık)");

                if (existingAlert != null)
                {
                    existingAlert.RiskPercentage = newRiskPercentage;
                    existingAlert.RiskLevel = newRiskLevel;
                    existingAlert.Suggestion = newSuggestion;
                    existingAlert.CalculatedAt = DateTime.UtcNow;
                    _context.DiseaseRiskAlerts.Update(existingAlert);
                }
                else
                {
                    var alert = new DiseaseRiskAlert
                    {
                        UserId = userId,
                        DiseaseName = "Mildiyö (Geç Yanıklık)",
                        RiskPercentage = newRiskPercentage,
                        RiskLevel = newRiskLevel,
                        Suggestion = newSuggestion,
                        CalculatedAt = DateTime.UtcNow
                    };
                    _context.DiseaseRiskAlerts.Add(alert);
                }
                await _context.SaveChangesAsync();

                _logger.LogInformation("Anlık risk hesaplaması başarıyla güncellendi/kaydedildi: %{Risk} ({Level})", 
                    newRiskPercentage, newRiskLevel);
            }

            return Ok(new
            {
                Message = "Konum bilgileri başarıyla güncellendi.",
                LatestRisk = new
                {
                    DiseaseName = "Mildiyö (Geç Yanıklık)",
                    RiskPercentage = newRiskPercentage,
                    RiskLevel = newRiskLevel,
                    Suggestion = newSuggestion,
                    CalculatedAt = DateTime.UtcNow
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Konum güncellenirken veya anlık risk hesaplanırken hata oluştu.");
            return StatusCode(500, new { Message = "Konum güncellenemedi.", Error = ex.Message });
        }
    }

    private int GetCurrentUserId()
    {
        var nameIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(nameIdClaim) || !int.TryParse(nameIdClaim, out var userId))
            throw new UnauthorizedAccessException("Geçersiz veya eksik kullanıcı kimliği.");
        return userId;
    }
}

public class UserLocationUpdateDto
{
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? ExpoPushToken { get; set; }
}
