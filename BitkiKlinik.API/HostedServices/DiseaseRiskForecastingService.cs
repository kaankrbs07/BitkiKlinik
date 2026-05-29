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

        // 1. Konumlu kullanıcıları hafif bir DTO listesi halinde AsNoTracking() ile ve kısa süreli bir scope içinde çekiyoruz.
        // Bu sayede veritabanı bağlantısı dış API döngüsü başlamadan hemen önce serbest bırakılır.
        List<UserLocationDto> users;
        await using (var scope = _services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            users = await db.Users
                .Where(u => u.Latitude != null && u.Longitude != null)
                .Select(u => new UserLocationDto(
                    u.Id,
                    u.Username,
                    u.Latitude!.Value,
                    u.Longitude!.Value,
                    u.ExpoPushToken
                ))
                .AsNoTracking()
                .ToListAsync(stoppingToken);
        }

        _logger.LogInformation("{Count} adet konumlu kullanıcı tespit edildi.", users.Count);

        if (!users.Any()) return;

        var alertsToSave = new List<DiseaseRiskAlert>();
        var pushNotificationsToEnqueue = new List<(string PushToken, float RiskPercentage, string Suggestion)>();

        // 2. Co-locate/cluster users within ~10km grid cells to prevent API rate limiting
        var userGroups = users
            .GroupBy(u => (LatGrid: Math.Round(u.Latitude, 1), LonGrid: Math.Round(u.Longitude, 1)))
            .ToList();

        _logger.LogInformation("Kullanıcılar {Count} adet benzersiz coğrafi grid hücresine kümelendi.", userGroups.Count);

        // 3. Dış hava durumu Open-Meteo API çağrılarını içeren döngüyü sıfır DB bağlantısı ile çalıştırıyoruz.
        await using (var scope = _services.CreateAsyncScope())
        {
            var weatherService = scope.ServiceProvider.GetRequiredService<IWeatherService>();

            foreach (var group in userGroups)
            {
                if (stoppingToken.IsCancellationRequested) break;

                // Grubu temsil eden koordinat (grubun ilk kullanıcısının koordinatı)
                var representative = group.First();

                try
                {
                    _logger.LogInformation("Coğrafi hücre ({LatGrid}, {LonGrid}) için hava tahmini çekiliyor...", group.Key.LatGrid, group.Key.LonGrid);

                    var forecast = await weatherService.GetHourlyForecastAsync(representative.Latitude, representative.Longitude);
                    if (forecast == null)
                    {
                        _logger.LogWarning("Grid hücresi ({LatGrid}, {LonGrid}) için hava tahmini çekilemedi.", group.Key.LatGrid, group.Key.LonGrid);
                        continue;
                    }

                    var (riskPercentage, riskLevel, suggestion) = DiseaseRiskCalculator.CalculateMildewRisk(forecast);

                    _logger.LogInformation("Hesaplanan Risk: %{Risk} ({Level})", riskPercentage, riskLevel);

                    foreach (var user in group)
                    {
                        // Son güncel riski geçici listeye ekle
                        var alert = new DiseaseRiskAlert
                        {
                            UserId = user.Id,
                            DiseaseName = "Mildiyö (Geç Yanıklık)",
                            RiskPercentage = riskPercentage,
                            RiskLevel = riskLevel,
                            Suggestion = suggestion,
                            CalculatedAt = DateTime.UtcNow
                        };

                        alertsToSave.Add(alert);

                        // Eğer risk kritikse ve push token varsa, kuyruklanacak bildirimler listesine ekle
                        if (riskPercentage >= 75.0f && !string.IsNullOrEmpty(user.ExpoPushToken))
                        {
                            pushNotificationsToEnqueue.Add((user.ExpoPushToken, riskPercentage, suggestion));
                        }
                    }

                    // Open-Meteo rate limitlerine saygı göstermek için istekler arasına kısa bir gecikme ekliyoruz
                    await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Grid hücresi ({LatGrid}, {LonGrid}) için tarımsal risk hesaplanırken hata oluştu.", group.Key.LatGrid, group.Key.LonGrid);
                }
            }
        }

        // 3. Toplu yazma (Batching): Tüm risk uyarılarını tek bir SaveChangesAsync() ile veritabanına kaydediyoruz.
        if (alertsToSave.Any())
        {
            _logger.LogInformation("{Count} adet tarımsal risk uyarısı toplu olarak kaydediliyor...", alertsToSave.Count);
            
            await using (var scope = _services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.DiseaseRiskAlerts.AddRangeAsync(alertsToSave, stoppingToken);
                await db.SaveChangesAsync(stoppingToken);
            }

            // 4. Başarıyla kaydedilen riskler için Hangfire push bildirimlerini kuyruğa al
            foreach (var push in pushNotificationsToEnqueue)
            {
                BackgroundJob.Enqueue<IPushNotificationJob>(
                    job => job.SendAsync(push.PushToken, push.RiskPercentage, push.Suggestion));
            }

            _logger.LogInformation("Tüm tarımsal risk uyarıları kaydedildi ve {PushCount} adet push bildirimi kuyruğa alındı.", pushNotificationsToEnqueue.Count);
        }
    }

    private record UserLocationDto(
        int Id,
        string Username,
        double Latitude,
        double Longitude,
        string? ExpoPushToken
    );
}

