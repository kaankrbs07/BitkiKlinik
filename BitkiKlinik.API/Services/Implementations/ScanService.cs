using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Interfaces;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// Tarama sonuçlarını PlantScans tablosuna kaydeder.
/// </summary>
public class ScanService : IScanService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<ScanService> _logger;

    public ScanService(ApplicationDbContext context, ILogger<ScanService> logger)
    {
        _context = context;
        _logger  = logger;
    }

    /// <inheritdoc />
    public async Task<PlantScan> SaveScanAsync(PlantScan scan)
    {
        await _context.PlantScans.AddAsync(scan);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Tarama kaydedildi → Id: {ScanId}, UserId: {UserId}, Durum: {Status}",
            scan.Id, scan.UserId, scan.Status);

        return scan;
    }

    /// <inheritdoc />
    public async Task<PlantScan?> GetScanByIdAsync(int scanId)
    {
        return await _context.PlantScans.FindAsync(scanId);
    }
}
