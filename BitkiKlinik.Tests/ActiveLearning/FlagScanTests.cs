using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Implementations;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace BitkiKlinik.Tests.ActiveLearning;

/// <summary>
/// FlagScanAsync ve duplicate engelleme mantığı testleri.
///
/// Kapsanan senaryolar:
///   1. Geçersiz scanId → false döner
///   2. İlk bildirimde yeni kuyruk kaydı oluşur
///   3. Aynı tarama tekrar bildirilirse yeni kayıt oluşmaz (duplicate engellenir)
///   4. LowConfidence kaydı varken kullanıcı bildirirse kaynak UserFlagged'e güncellenir
///   5. Resolved durumundaki kayıt varken tekrar bildirilirse yeni Pending kayıt oluşur
/// </summary>
public class FlagScanTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly ActiveLearningService _sut;

    public FlagScanTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString()) // Her test kendi izole DB'sinde
            .Options;

        _db = new ApplicationDbContext(options);

        // Bağımlılıklar: HTTP, Config, Env, Storage, Logger mock'lanır
        var httpFactory    = new Mock<IHttpClientFactory>();
        var config         = new Mock<IConfiguration>();
        var env            = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        var storageService = new Mock<API.Services.Interfaces.IFileStorageService>();
        var logger         = NullLogger<ActiveLearningService>.Instance;

        // GetFileBytesAsync → null döner (dosya bulunamadı, fallback path kullanılır)
        storageService
            .Setup(s => s.GetFileBytesAsync(It.IsAny<string>()))
            .ReturnsAsync((byte[]?)null);

        _sut = new ActiveLearningService(
            _db,
            httpFactory.Object,
            config.Object,
            env.Object,
            storageService.Object,
            logger,
            retrainQueueService: null
        );
    }

    // ── Yardımcı: Test için sahte PlantScan oluşturur ──────────────────────
    private async Task<PlantScan> CreateScanAsync(int userId = 1)
    {
        // Scan FK olarak Users gerektirir
        if (!_db.Users.Any(u => u.Id == userId))
        {
            _db.Users.Add(new Users
            {
                Id           = userId,
                Username     = "testuser",
                Email        = "test@test.com",
                Password     = "hash",
                Role         = UserRole.User,
            });
        }

        var scan = new PlantScan
        {
            UserId      = userId,
            PlantName   = "Domates",
            DiseaseName = "Domates Pası",
            Confidence  = 0.55f,
            ImageUrl    = "uploads/scans/test.jpg",
            Status      = ScanStatus.Risky,
            ScanDate    = DateTime.UtcNow,
        };

        _db.PlantScans.Add(scan);
        await _db.SaveChangesAsync();
        return scan;
    }

    // ── Test 1: Geçersiz scanId ─────────────────────────────────────────────
    [Fact]
    public async Task FlagScan_InvalidScanId_ReturnsFalse()
    {
        var result = await _sut.FlagScanAsync(scanId: 9999);

        result.Should().BeFalse("var olmayan bir tarama ID'si bildirildiğinde false dönmeli");
    }

    // ── Test 2: İlk bildirim → yeni Pending kayıt oluşur ──────────────────
    [Fact]
    public async Task FlagScan_FirstTime_CreatesNewPendingQueueItem()
    {
        var scan = await CreateScanAsync();

        var result = await _sut.FlagScanAsync(scan.Id);

        result.Should().BeTrue();

        var queueItems = _db.ActiveLearningQueue
            .Where(q => q.ScanId == scan.Id)
            .ToList();

        queueItems.Should().HaveCount(1, "ilk bildirimde sadece bir kuyruk kaydı oluşmalı");
        queueItems[0].Status.Should().Be(ActiveLearningStatus.Pending);
        queueItems[0].Source.Should().Be(ActiveLearningSource.UserFlagged);
    }

    // ── Test 3: Aynı tarama iki kez bildirilirse duplicate oluşmaz ─────────
    [Fact]
    public async Task FlagScan_DuplicateFlag_DoesNotCreateSecondQueueItem()
    {
        var scan = await CreateScanAsync();

        await _sut.FlagScanAsync(scan.Id); // 1. bildirim
        await _sut.FlagScanAsync(scan.Id); // 2. bildirim (duplicate)

        var queueItems = _db.ActiveLearningQueue
            .Where(q => q.ScanId == scan.Id && q.Status == ActiveLearningStatus.Pending)
            .ToList();

        queueItems.Should().HaveCount(1, "aynı tarama tekrar bildirildiğinde yeni kayıt oluşmamalı");
    }

    // ── Test 4: LowConfidence Pending varken bildirilirse kaynak güncellenir
    [Fact]
    public async Task FlagScan_WhenLowConfidenceAlreadyPending_UpdatesSourceToUserFlagged()
    {
        var scan = await CreateScanAsync();

        // Önce LowConfidence kuyruğu simüle et (backfill servisi ekler)
        _db.ActiveLearningQueue.Add(new ActiveLearningQueue
        {
            ScanId           = scan.Id,
            ImagePath        = scan.ImageUrl ?? "",
            PredictedDisease = scan.DiseaseName,
            Confidence       = scan.Confidence,
            Status           = ActiveLearningStatus.Pending,
            Source           = ActiveLearningSource.LowConfidence,
            CreatedAt        = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync();

        // Kullanıcı bildirimi yapar
        var result = await _sut.FlagScanAsync(scan.Id);

        result.Should().BeTrue();

        var item = _db.ActiveLearningQueue.Single(q => q.ScanId == scan.Id);
        item.Source.Should().Be(ActiveLearningSource.UserFlagged,
            "LowConfidence beklerken kullanıcı bildirirse kaynak UserFlagged'e yükseltilmeli");

        _db.ActiveLearningQueue
            .Count(q => q.ScanId == scan.Id)
            .Should().Be(1, "kayıt oluşturulmamış, sadece güncellenmeli");
    }

    // ── Test 5: Resolved kayıt varken tekrar bildirilirse yeni Pending oluşur
    [Fact]
    public async Task FlagScan_WhenPreviousItemResolved_CreatesNewPendingItem()
    {
        var scan = await CreateScanAsync();

        // Önceki bildirim zaten çözüme kavuşturulmuş (Resolved)
        _db.ActiveLearningQueue.Add(new ActiveLearningQueue
        {
            ScanId           = scan.Id,
            ImagePath        = scan.ImageUrl ?? "",
            PredictedDisease = scan.DiseaseName,
            Confidence       = scan.Confidence,
            Status           = ActiveLearningStatus.Resolved,
            Source           = ActiveLearningSource.UserFlagged,
            CreatedAt        = DateTime.UtcNow.AddDays(-2),
            ReviewedAt       = DateTime.UtcNow.AddDays(-1),
        });
        await _db.SaveChangesAsync();

        // Kullanıcı yeniden bildirir
        var result = await _sut.FlagScanAsync(scan.Id);

        result.Should().BeTrue();

        var pendingItems = _db.ActiveLearningQueue
            .Where(q => q.ScanId == scan.Id && q.Status == ActiveLearningStatus.Pending)
            .ToList();

        pendingItems.Should().HaveCount(1, "Resolved kayıt Pending sayılmaz, yeni bildirim yeni Pending oluşturmalı");
    }

    public void Dispose() => _db.Dispose();
}
