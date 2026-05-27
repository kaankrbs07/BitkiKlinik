using System;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.Jobs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Implementations;
using BitkiKlinik.API.Services.Interfaces;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BitkiKlinik.API.HostedServices;

public class DiseaseRiskForecastingService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<DiseaseRiskForecastingService> _logger;

    public DiseaseRiskForecastingService(
        IServiceProvider services,
        ILogger<DiseaseRiskForecastingService> logger)
    {
        _services = services;
        _logger   = logger;
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

                // Eğer risk kritikse (>= 75%) ve kullanıcının push token'ı tanımlıysa
                // Hangfire kuyruğuna push bildirimi işi ekle — doğrudan HTTP yerine.
                // Bu sayede:
                //   - Ana döngü bloklanmaz (10.000 kullanıcı için bile akıcı çalışır)
                //   - Başarısız bildirimler otomatik yeniden denenir (PushNotificationJob AutomaticRetry)
                //   - Hangfire Dashboard'dan her bildirim izlenebilir
                if (riskPercentage >= 75.0f && !string.IsNullOrEmpty(user.ExpoPushToken))
                {
                    BackgroundJob.Enqueue<IPushNotificationJob>(
                        job => job.SendAsync(user.ExpoPushToken, riskPercentage, suggestion));

                    _logger.LogInformation(
                        "Push bildirimi Hangfire kuyruğuna eklendi. UserId: {UserId}", user.Id);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Kullanıcı {UserId} için tarımsal risk hesaplanırken hata oluştu.", user.Id);
            }
        }
    }
}

