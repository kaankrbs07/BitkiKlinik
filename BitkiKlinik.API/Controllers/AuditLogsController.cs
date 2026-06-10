using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BitkiKlinik.API.Controllers;

/// <summary>
/// Sistemdeki kritik işlemlerin denetim günlüklerini admin kullanıcılara sunar.
/// Tüm endpoint'ler [Authorize(Roles = "Admin")] ile korunmaktadır.
/// </summary>
[Route("api/admin/audit-logs")]
[ApiController]
[Authorize(Roles = "Admin")]
public class AuditLogsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<AuditLogsController> _logger;

    public AuditLogsController(ApplicationDbContext context, ILogger<AuditLogsController> logger)
    {
        _context = context;
        _logger  = logger;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  GET /api/admin/audit-logs
    //  Filtreler: tableName, userId, action, startDate, endDate, page, pageSize
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Denetim günlüklerini sayfalı ve filtreli olarak listeler.
    /// </summary>
    /// <param name="tableName">Tablo adına göre filtrele (ör. "Users", "Disease", "Treatment").</param>
    /// <param name="userId">İşlemi yapan kullanıcı ID'sine göre filtrele.</param>
    /// <param name="action">İşlem türüne göre filtrele (Insert=1, Update=2, Delete=3, SoftDelete=4).</param>
    /// <param name="startDate">Başlangıç tarihine göre filtrele (UTC, ör. 2026-01-01).</param>
    /// <param name="endDate">Bitiş tarihine göre filtrele (UTC, ör. 2026-12-31).</param>
    /// <param name="page">Sayfa numarası (varsayılan: 1).</param>
    /// <param name="pageSize">Sayfa başı kayıt sayısı (varsayılan: 50, maksimum: 200).</param>
    [HttpGet]
    public async Task<IActionResult> GetAuditLogs(
        [FromQuery] string?      tableName  = null,
        [FromQuery] string?      userId     = null,
        [FromQuery] AuditAction? action     = null,
        [FromQuery] DateTime?    startDate  = null,
        [FromQuery] DateTime?    endDate    = null,
        [FromQuery] int          page       = 1,
        [FromQuery] int          pageSize   = 50)
    {
        page     = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _context.AuditLogs.AsNoTracking();

        // ── Filtreler ──────────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(tableName))
            query = query.Where(a => a.TableName == tableName);

        if (!string.IsNullOrWhiteSpace(userId))
            query = query.Where(a => a.UserId == userId);

        if (action.HasValue)
            query = query.Where(a => a.Action == action.Value);

        if (startDate.HasValue)
            query = query.Where(a => a.Timestamp >= startDate.Value.ToUniversalTime());

        if (endDate.HasValue)
            query = query.Where(a => a.Timestamp <= endDate.Value.ToUniversalTime().AddDays(1));

        // ── Sayfalama ──────────────────────────────────────────────────────────
        var totalCount = await query.CountAsync();
        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        var logs = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id,
                a.UserId,
                Timestamp      = a.Timestamp,
                a.TableName,
                a.EntityId,
                Action         = a.Action.ToString(),
                a.OldValues,
                a.NewValues,
                a.ChangedColumns
            })
            .ToListAsync();

        Response.Headers["X-Total-Count"]  = totalCount.ToString();
        Response.Headers["X-Total-Pages"]  = totalPages.ToString();
        Response.Headers["X-Current-Page"] = page.ToString();
        Response.Headers["Access-Control-Expose-Headers"] =
            "X-Total-Count, X-Total-Pages, X-Current-Page";

        _logger.LogInformation(
            "Audit log sorgusu. Kullanıcı: {UserId}, Filtreler: tablo={Table} aksiyon={Action} başlangıç={Start} bitiş={End}",
            User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            tableName, action, startDate, endDate);

        return Ok(logs);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  GET /api/admin/audit-logs/{id}
    //  Tek bir audit log kaydının tüm detaylarını getirir
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Belirli bir denetim kaydının tüm alanlarını döner (OldValues/NewValues JSON dahil).
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetAuditLogById(int id)
    {
        var log = await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.Id == id)
            .Select(a => new
            {
                a.Id,
                a.UserId,
                Timestamp      = a.Timestamp,
                a.TableName,
                a.EntityId,
                Action         = a.Action.ToString(),
                a.OldValues,
                a.NewValues,
                a.ChangedColumns
            })
            .FirstOrDefaultAsync();

        if (log is null)
            return NotFound(new { Message = "Audit log kaydı bulunamadı." });

        return Ok(log);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  GET /api/admin/audit-logs/summary
    //  İşlem türlerine göre sayım özeti — admin dashboard widget'ı için
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Son 30 güne ait işlem türü başına kayıt sayılarını döner.
    /// Admin dashboard'da özet kart/grafik göstermek için kullanılabilir.
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var since = DateTime.UtcNow.AddDays(-30);

        var summary = await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.Timestamp >= since)
            .GroupBy(a => new { a.TableName, a.Action })
            .Select(g => new
            {
                g.Key.TableName,
                Action = g.Key.Action.ToString(),
                Count  = g.Count()
            })
            .OrderBy(x => x.TableName)
            .ThenBy(x => x.Action)
            .ToListAsync();

        return Ok(new
        {
            PeriodDays = 30,
            Since      = since,
            Data       = summary
        });
    }
}
