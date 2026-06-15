using System;

namespace BitkiKlinik.API.Models;

/// <summary>
/// Yapay Zeka Hekimi (Gemini) sohbet mesajlarını veritabanında kalıcı tutan model.
/// </summary>
public class ChatMessage
{
    public int Id { get; set; }

    /// <summary>
    /// Mesajın ait olduğu teşhis taraması ID'si (opsiyonel).
    /// </summary>
    public int? ScanId { get; set; }
    public PlantScan? Scan { get; set; }

    /// <summary>
    /// Sohbet oturumu benzersiz kimliği (Guid).
    /// </summary>
    public string SessionId { get; set; } = string.Empty;

    /// <summary>
    /// Mesajı atan/alan kullanıcı ID'si.
    /// </summary>
    public int UserId { get; set; }
    public Users User { get; set; } = null!;

    /// <summary>
    /// Mesajı atan rol: "user" veya "model"
    /// </summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>
    /// Mesaj içeriği.
    /// </summary>
    public string Content { get; set; } = string.Empty;

    /// <summary>
    /// Mesajın gönderilme tarihi (UTC).
    /// </summary>
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Sohbet mesajının aktif olup olmadığını belirtir (soft delete desteği).
    /// </summary>
    public bool IsActive { get; set; } = true;
}
