using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.Models;

/// <summary>
/// Sistemdeki kritik veri değişimlerinin denetim kaydı.
/// Her satır; kim, ne zaman, hangi tablo üzerinde, hangi işlemi yaptı sorusunu yanıtlar.
/// </summary>
public class AuditLog
{
    public int Id { get; set; }

    // ── Kim yaptı? ────────────────────────────────────────────────
    /// <summary>
    /// İşlemi yapan kullanıcının Id'si.
    /// Arka plan servisleri veya seed işlemleri için "System" değeri atanır.
    /// </summary>
    public string UserId { get; set; } = "System";

    // ── Ne zaman yaptı? ────────────────────────────────────────────
    /// <summary>UTC bazlı işlem zaman damgası.</summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    // ── Hangi tabloda? ─────────────────────────────────────────────
    /// <summary>Etkilenen EF Core entity tablo adı (ör. "Users", "Disease").</summary>
    public string TableName { get; set; } = string.Empty;

    /// <summary>
    /// Etkilenen satırın birincil anahtar değeri (string'e dönüştürülmüş).
    /// Bileşik PK'larda JSON formatında tutulur.
    /// </summary>
    public string EntityId { get; set; } = string.Empty;

    // ── Ne yaptı? ─────────────────────────────────────────────────
    /// <summary>İşlem türü: Insert, Update, Delete veya SoftDelete.</summary>
    public AuditAction Action { get; set; }

    // ── Detay: ne değişti? ─────────────────────────────────────────
    /// <summary>
    /// Update/Delete öncesi değerler (JSON).
    /// Insert işlemlerinde null'dır.
    /// Hassas alanlar (Password, RefreshToken vb.) [MASKED] ile gizlenir.
    /// </summary>
    public string? OldValues { get; set; }

    /// <summary>
    /// Insert/Update sonrası değerler (JSON).
    /// Delete işlemlerinde null'dır.
    /// Hassas alanlar (Password, RefreshToken vb.) [MASKED] ile gizlenir.
    /// </summary>
    public string? NewValues { get; set; }

    /// <summary>
    /// Update işlemlerinde yalnızca değişen kolon adları (JSON array).
    /// Büyük entity'lerde tüm snapshot'ı okumak yerine delta'yı hızla görmek için kullanılır.
    /// </summary>
    public string? ChangedColumns { get; set; }
}
