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
/// ResolveAsync testleri:
///   1. Geçersiz queueId → false döner
///   2. Başarılı onayda status Resolved olur
///   3. CorrectedDisease kaydedilir
///   4. Bağlı PlantScan kaydı güncellenir
///   5. Sağlıklı teşhis onaylandığında scan status Healthy olur
/// </summary>
public class ResolveAsyncTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly ActiveLearningService _sut;

    public ResolveAsyncTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new ApplicationDbContext(options);

        var httpFactory    = new Mock<IHttpClientFactory>();
        var config         = new Mock<IConfiguration>();
        var env            = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        var storageService = new Mock<API.Services.Interfaces.IFileStorageService>();

        storageService
            .Setup(s => s.GetFileBytesAsync(It.IsAny<string>()))
            .ReturnsAsync((byte[]?)null);

        // HttpClient factory mock: PostAsync çağrısı başarılı döner
        var httpClient = new System.Net.Http.HttpClient(new OkHttpMessageHandler());
        httpFactory
            .Setup(f => f.CreateClient(It.IsAny<string>()))
            .Returns(httpClient);

        _sut = new ActiveLearningService(
            _db,
            httpFactory.Object,
            config.Object,
            env.Object,
            storageService.Object,
            NullLogger<ActiveLearningService>.Instance,
            retrainQueueService: null
        );
    }

    private async Task<(PlantScan scan, ActiveLearningQueue queueItem)> CreatePendingItemAsync(
        string diseaseName = "Domates Pası",
        string corrected   = "Domates__Leaf_Mold")
    {
        _db.Users.Add(new Users
        {
            Id = 1, Username = "u", Email = "e@e.com", Password = "h", Role = UserRole.User
        });

        var scan = new PlantScan
        {
            UserId      = 1,
            PlantName   = "Domates",
            DiseaseName = diseaseName,
            Confidence  = 0.45f,
            ImageUrl    = "uploads/scans/img.jpg",
            Status      = ScanStatus.Risky,
            ScanDate    = DateTime.UtcNow,
        };
        _db.PlantScans.Add(scan);
        await _db.SaveChangesAsync();

        var item = new ActiveLearningQueue
        {
            ScanId           = scan.Id,
            ImagePath        = scan.ImageUrl,
            PredictedDisease = diseaseName,
            Confidence       = 0.45,
            Status           = ActiveLearningStatus.Pending,
            Source           = ActiveLearningSource.UserFlagged,
            CreatedAt        = DateTime.UtcNow,
        };
        _db.ActiveLearningQueue.Add(item);
        await _db.SaveChangesAsync();

        return (scan, item);
    }

    // ── Test 1: Geçersiz queueId ───────────────────────────────────────────
    [Fact]
    public async Task Resolve_InvalidQueueId_ReturnsFalse()
    {
        var result = await _sut.ResolveAsync(queueId: 9999, correctedDisease: "SomeLabel");

        result.Should().BeFalse();
    }

    // ── Test 2: Başarılı onay → status Resolved olur ───────────────────────
    [Fact]
    public async Task Resolve_ValidItem_SetsStatusToResolved()
    {
        var (_, item) = await CreatePendingItemAsync();

        var result = await _sut.ResolveAsync(item.Id, "Domates__Leaf_Mold");

        result.Should().BeTrue();

        var updated = await _db.ActiveLearningQueue.FindAsync(item.Id);
        updated!.Status.Should().Be(ActiveLearningStatus.Resolved);
    }

    // ── Test 3: CorrectedDisease kaydedilir ────────────────────────────────
    [Fact]
    public async Task Resolve_ValidItem_SavesCorrectedDisease()
    {
        var (_, item) = await CreatePendingItemAsync();
        const string corrected = "Domates__Late_Blight";

        await _sut.ResolveAsync(item.Id, corrected);

        var updated = await _db.ActiveLearningQueue.FindAsync(item.Id);
        updated!.CorrectedDisease.Should().Be(corrected);
    }

    // ── Test 4: Bağlı PlantScan güncellenir ────────────────────────────────
    [Fact]
    public async Task Resolve_ValidItem_UpdatesLinkedPlantScan()
    {
        // Diseases tablosuna eşleşme ekle
        _db.Diseases.Add(new Disease
        {
            Id = 1, Name = "Domates Geç Yanıklığı", ModelLabel = "Domates__Late_Blight", Description = "-"
        });
        await _db.SaveChangesAsync();

        var (scan, item) = await CreatePendingItemAsync();

        await _sut.ResolveAsync(item.Id, "Domates__Late_Blight");

        var updatedScan = await _db.PlantScans.FindAsync(scan.Id);
        updatedScan!.DiseaseName.Should().Be("Domates Geç Yanıklığı",
            "disease name, modelLabel'dan human-friendly isme dönüştürülmeli");
        updatedScan.Status.Should().Be(ScanStatus.Risky);
    }

    // ── Test 5: Healthy teşhis onayı → scan status Healthy olur ───────────
    [Fact]
    public async Task Resolve_HealthyDisease_SetsScanStatusToHealthy()
    {
        _db.Diseases.Add(new Disease
        {
            Id = 2, Name = "Sağlıklı Domates", ModelLabel = "Domates__Healthy", Description = "-"
        });
        await _db.SaveChangesAsync();

        var (scan, item) = await CreatePendingItemAsync();

        await _sut.ResolveAsync(item.Id, "Domates__Healthy");

        var updatedScan = await _db.PlantScans.FindAsync(scan.Id);
        updatedScan!.Status.Should().Be(ScanStatus.Healthy,
            "'Sağlıklı' içeren teşhis onaylandığında tarama durumu Healthy olmalı");
    }

    public void Dispose() => _db.Dispose();
}

/// <summary>
/// HttpMessageHandler stub: tüm POST/GET isteklerine 200 OK döner.
/// ActiveLearningService'in Python ML servisine yaptığı HTTP çağrılarını simüle eder.
/// </summary>
internal class OkHttpMessageHandler : System.Net.Http.HttpMessageHandler
{
    protected override Task<System.Net.Http.HttpResponseMessage> SendAsync(
        System.Net.Http.HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        return Task.FromResult(new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new System.Net.Http.StringContent("{}")
        });
    }
}
