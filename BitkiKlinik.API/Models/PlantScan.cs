using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.Models;

/// <summary>
/// Bir kullanıcının yaptığı bitki tarama kaydını temsil eder.
/// Her taramada AI modelinden dönen sonuçlar burada saklanır.
/// </summary>
public class PlantScan
{
    public int Id { get; set; }

    // ── İlişkiler ────────────────────────────────────────────────
    public int UserId { get; set; }
    public Users User { get; set; } = null!;

    // ── Tarama detayları ─────────────────────────────────────────
    /// <summary>Bitki adı (ör: Domates, Biber, Patates)</summary>
    public string PlantName { get; set; } = string.Empty;

    /// <summary>Hastalık adı (ör: Domates Pası) — sağlıklıysa "Sağlıklı"</summary>
    public string DiseaseName { get; set; } = string.Empty;

    /// <summary>AI modelinin güven skoru (0.0 – 1.0)</summary>
    public float Confidence { get; set; }

    /// <summary>Yüklenen görselin sunucudaki göreli URL'i</summary>
    public string? ImageUrl { get; set; }

    /// <summary>Tarama durumu: Healthy veya Risky</summary>
    public ScanStatus Status { get; set; }

    /// <summary>Tarama tarihi (UTC)</summary>
    public DateTime ScanDate { get; set; } = DateTime.UtcNow;
}
