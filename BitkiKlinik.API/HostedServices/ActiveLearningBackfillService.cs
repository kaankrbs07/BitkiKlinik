using BitkiKlinik.API.Configuration;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace BitkiKlinik.API.HostedServices;

/// <summary>
/// Uygulama başladıktan sonra arka planda çalışır.
/// Geçmiş düşük-güven taramalarını aktif öğrenme kuyruğuna taşır.
///
/// Program.cs'ten çıkarılmasının sebebi:
///   - İş mantığı, uygulamanın composition root'una ait değil.
///   - Test edilebilir ve izole edilebilir.
///   - Program.cs'e `await` eklemek başlangıç süresini uzatırdı;
///     BackgroundService bunu HTTP trafiği kabul edildikten sonra çalıştırır.
/// </summary>
public sealed class ActiveLearningBackfillService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ActiveLearningBackfillService> _logger;

    public ActiveLearningBackfillService(
        IServiceProvider services,
        ILogger<ActiveLearningBackfillService> logger)
    {
        _services = services;
        _logger   = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Kısa gecikme: migration ve seed'in tamamlanmasını bekle
        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);

        _logger.LogInformation("Aktif öğrenme backfill görevi başlatıldı.");

        try
        {
            await using var scope = _services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var activeLearningService = scope.ServiceProvider.GetRequiredService<IActiveLearningService>();

            // Eşiğin altındaki geçmiş taramaları bul
            var lowConfidenceScans = await db.PlantScans
                .Where(s => s.Confidence < GlobalConstants.ActiveLearningThreshold)
                .AsNoTracking()
                .ToListAsync(stoppingToken);

            if (!lowConfidenceScans.Any())
            {
                _logger.LogInformation("Backfill tamamlandı: kuyruğa eklenecek düşük güvenli tarama bulunamadı.");
                return;
            }

            // Zaten kuyruğa eklenmiş tarama ID'lerini çek
            var enqueuedScanIds = await db.ActiveLearningQueue
                .Where(q => q.ScanId != null)
                .Select(q => q.ScanId!.Value)
                .ToHashSetAsync(stoppingToken);

            var count = 0;
            foreach (var scan in lowConfidenceScans)
            {
                if (stoppingToken.IsCancellationRequested) break;
                if (enqueuedScanIds.Contains(scan.Id)) continue;

                await activeLearningService.EnqueueAsync(
                    scanId           : scan.Id,
                    imagePath        : scan.ImageUrl ?? string.Empty,
                    predictedDisease : scan.DiseaseName,
                    confidence       : scan.Confidence,
                    source           : ActiveLearningSource.LowConfidence
                );
                count++;
            }

            _logger.LogInformation(
                "Aktif öğrenme backfill tamamlandı: {Count} tarama kuyruğa eklendi.", count);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Aktif öğrenme backfill uygulama kapanışı nedeniyle iptal edildi.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Aktif öğrenme backfill sırasında beklenmeyen hata oluştu.");
        }
    }
}
