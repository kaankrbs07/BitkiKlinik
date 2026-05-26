using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Implementations;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BitkiKlinik.API.HostedServices;

public class DiseaseRiskForecastingService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<DiseaseRiskForecastingService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;

    public DiseaseRiskForecastingService(
        IServiceProvider services,
        ILogger<DiseaseRiskForecastingService> logger,
        IHttpClientFactory httpClientFactory)
    {
        _services = services;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Sunucu ayağa kalktıktan sonra kısa bir süre bekleyelim
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        _logger.LogInformation("Tarımsal Hava Durumu ve Hastalık Risk Tahmini servisi başlatıldı.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CalculateAndAlertAllUsersAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Tarımsal hastalık risk tahmini çalıştırılırken hata oluştu.");
            }

            // 24 saatte bir çalışacak şekilde bekleme ekliyoruz
            try
            {
                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task CalculateAndAlertAllUsersAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Kullanıcılar için tarımsal risk tahminleri hesaplanıyor...");

        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var weatherService = scope.ServiceProvider.GetRequiredService<IWeatherService>();

        // Konum bilgisi tanımlı olan kullanıcıları buluyoruz
        var users = await db.Users
            .Where(u => u.Latitude != null && u.Longitude != null)
            .ToListAsync(stoppingToken);

        _logger.LogInformation("{Count} adet konumlu kullanıcı tespit edildi.", users.Count);

        foreach (var user in users)
        {
            if (stoppingToken.IsCancellationRequested) break;

            try
            {
                _logger.LogInformation("Kullanıcı {UserId} ({Username}) için tahmin alınıyor. Konum: {Lat}, {Lon}",
                    user.Id, user.Username, user.Latitude, user.Longitude);

                var forecast = await weatherService.GetHourlyForecastAsync(user.Latitude!.Value, user.Longitude!.Value);
                if (forecast == null)
                {
                    _logger.LogWarning("Kullanıcı {UserId} için hava tahmini çekilemedi.", user.Id);
                    continue;
                }

                var (riskPercentage, riskLevel, suggestion) = DiseaseRiskCalculator.CalculateMildewRisk(forecast);

                _logger.LogInformation("Hesaplanan Risk: %{Risk} ({Level})", riskPercentage, riskLevel);

                // Son güncel riski veritabanına kaydet
                var alert = new DiseaseRiskAlert
                {
                    UserId = user.Id,
                    DiseaseName = "Mildiyö (Geç Yanıklık)",
                    RiskPercentage = riskPercentage,
                    RiskLevel = riskLevel,
                    Suggestion = suggestion,
                    CalculatedAt = DateTime.UtcNow
                };

                db.DiseaseRiskAlerts.Add(alert);
                await db.SaveChangesAsync(stoppingToken);

                // Eğer risk kritikse (>= 75%) ve kullanıcının push token'ı tanımlıysa, anlık bildirim gönder
                if (riskPercentage >= 75.0f && !string.IsNullOrEmpty(user.ExpoPushToken))
                {
                    await SendPushNotificationAsync(user.ExpoPushToken, riskPercentage, suggestion);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Kullanıcı {UserId} için tarımsal risk hesaplanırken hata oluştu.", user.Id);
            }
        }
    }

    private async Task SendPushNotificationAsync(string pushToken, float riskPercentage, string suggestion)
    {
        try
        {
            _logger.LogInformation("Expo Push Notification gönderiliyor. Alıcı: {Token}", pushToken);
            
            var client = _httpClientFactory.CreateClient();
            var payload = new
            {
                to = pushToken,
                sound = "default",
                title = "Kritik Mantar Hastalığı Riski! ⚠️",
                body = $"Tarlanızda Mildiyö riski %{riskPercentage} seviyesine ulaştı. Önlem: {suggestion}",
                data = new { screen = "home" }
            };

            var response = await client.PostAsJsonAsync("https://exp.host/--/api/v2/push/send", payload);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Push bildirimi başarıyla gönderildi.");
            }
            else
            {
                var errorText = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Push bildirimi başarısız oldu. Hata: {Error}", errorText);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Push bildirimi gönderilirken beklenmeyen hata.");
        }
    }
}
