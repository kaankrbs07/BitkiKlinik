namespace BitkiKlinik.API.Models.Enums;

public enum AuditAction
{
    /// <summary>Yeni bir kayıt eklendi (INSERT).</summary>
    Insert = 1,

    /// <summary>Mevcut bir kayıt güncellendi (UPDATE).</summary>
    Update = 2,

    /// <summary>Kayıt fiziksel olarak veritabanından silindi (DELETE).</summary>
    Delete = 3,

    /// <summary>
    /// Kayıt pasife alındı — IsActive = false (Soft Delete).
    /// EF Core state'i Modified gösterse de iş anlamı silinmedir.
    /// </summary>
    SoftDelete = 4
}
