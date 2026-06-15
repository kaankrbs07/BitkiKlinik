using System.Security.Claims;
using System.Text.Json;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace BitkiKlinik.API.Interceptors;

/// <summary>
/// EF Core SaveChanges pipeline'ına bağlanan merkezi Audit Log Interceptor'ı.
///
/// Nasıl çalışır?
///   - <see cref="SavingChangesAsync"/> her DbContext.SaveChangesAsync() çağrısında tetiklenir.
///   - ChangeTracker üzerindeki Modified/Added/Deleted entity'ler taranır.
///   - Yalnızca <see cref="_auditedEntities"/> whitelist'indeki tablolar loglanır.
///   - <see cref="_sensitiveProperties"/> listesindeki alanlar "[MASKED]" ile gizlenir.
///   - Soft delete (IsActive = false değişimi) ayrı bir <see cref="AuditAction.SoftDelete"/> olarak kaydedilir.
/// </summary>
public sealed class AuditLogInterceptor : SaveChangesInterceptor
{
    // ── Bağımlılıklar ──────────────────────────────────────────────────────────
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditLogInterceptor> _logger;

    // ── Konfigürasyon ──────────────────────────────────────────────────────────

    /// <summary>
    /// Audit tablosuna yazılacak entity'lerin tablo adları (whitelist).
    /// Bu listede olmayan tablolardaki değişiklikler sessizce atlanır.
    /// </summary>
    private static readonly HashSet<string> _auditedEntities = new(StringComparer.OrdinalIgnoreCase)
    {
        "Users",
        "Diseases",
        "Treatments",
        "ChatMessages"
    };

    /// <summary>
    /// Audit loglarına asla yazılmaması gereken hassas property adları.
    /// Bu adlar karşılaşıldığında değer yerine "[MASKED]" yazılır.
    /// </summary>
    private static readonly HashSet<string> _sensitiveProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "Password",
        "RefreshToken",
        "RefreshTokenExpiry",
        "VerificationCode",
        "VerificationCodeExpiryTime"
    };

    /// <summary>
    /// Konum (Latitude/Longitude) değişikliğinin loga düşmesi için gereken minimum mesafe (km).
    /// Bu eşiğin altındaki GPS sürüklenmeleri (drift) sessizce yok sayılır.
    /// 5 km → şehir içi normal hareketi yakalar, ufak titreşimleri filtreler.
    /// </summary>
    private const double LocationChangeThresholdKm = 5.0;

    // ──────────────────────────────────────────────────────────────────────────
    public AuditLogInterceptor(
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuditLogInterceptor> logger)
    {
        _httpContextAccessor = httpContextAccessor;
        _logger              = logger;
    }

    // ── Ana giriş noktası ─────────────────────────────────────────────────────

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is null)
            return base.SavingChangesAsync(eventData, result, cancellationToken);

        try
        {
            var auditLogs = BuildAuditLogs(eventData.Context);
            if (auditLogs.Count > 0)
                eventData.Context.Set<AuditLog>().AddRange(auditLogs);
        }
        catch (Exception ex)
        {
            // Audit loglama başarısız olursa esas işlemi bloke ETME.
            // Hata NLog'a düşsün, kullanıcı işlemi tamamlansın.
            _logger.LogError(ex, "Audit log oluşturulurken beklenmeyen hata.");
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    // ── Log oluşturma mantığı ─────────────────────────────────────────────────

    private List<AuditLog> BuildAuditLogs(DbContext context)
    {
        var userId = ResolveUserId();
        var logs   = new List<AuditLog>();

        // AuditLog entity'sinin kendi değişikliklerini loglama (sonsuz döngü önleme)
        var entries = context.ChangeTracker
            .Entries()
            .Where(e =>
                e.Entity is not AuditLog &&
                e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        foreach (var entry in entries)
        {
            var tableName = entry.Metadata.GetTableName() ?? entry.Metadata.ClrType.Name;

            // Whitelist kontrolü: listedeki tablolar dışındakiler atlanır
            if (!_auditedEntities.Contains(tableName))
                continue;

            // Özel durum: ChatMessage tablosu için sadece yeni sohbet başlatma (ilk mesaj) loglansın,
            // sonraki normal mesaj yazmaları loglanmasın.
            if (entry.Entity is ChatMessage chatMessage && entry.State == EntityState.Added)
            {
                var isNewSession = !context.Set<ChatMessage>().Any(m => m.SessionId == chatMessage.SessionId);
                if (!isNewSession)
                {
                    continue;
                }
            }

            var entityId = GetEntityId(entry);
            var action   = DetermineAction(entry);

            var log = new AuditLog
            {
                UserId    = userId,
                Timestamp = DateTime.UtcNow,
                TableName = tableName,
                EntityId  = entityId,
                Action    = action
            };

            switch (action)
            {
                case AuditAction.Insert:
                    log.NewValues = SerializeProperties(entry.CurrentValues);
                    break;

                case AuditAction.Delete:
                    log.OldValues = SerializeProperties(entry.OriginalValues);
                    break;

                case AuditAction.Update:
                case AuditAction.SoftDelete:
                    // Sadece gerçekten değişen alanları bul
                    var changedProps = entry.Properties
                        .Where(p => p.IsModified && !Equals(
                            ConvertValue(p.OriginalValue),
                            ConvertValue(p.CurrentValue)))
                        .ToList();

                    // ── Konum eşiği filtresi ──────────────────────────────────
                    // Latitude ve Longitude birlikte değiştiyse Haversine mesafesini hesapla.
                    // Eşiğin (LocationChangeThresholdKm) altındaysa her ikisini de listeden çıkar;
                    // yalnız koordinat değişikliği kaldıysa log hiç oluşturulmaz.
                    var latProp = changedProps.FirstOrDefault(p => p.Metadata.Name == "Latitude");
                    var lonProp = changedProps.FirstOrDefault(p => p.Metadata.Name == "Longitude");

                    if (latProp is not null && lonProp is not null)
                    {
                        var oldLat = Convert.ToDouble(latProp.OriginalValue ?? 0);
                        var oldLon = Convert.ToDouble(lonProp.OriginalValue ?? 0);
                        var newLat = Convert.ToDouble(latProp.CurrentValue ?? 0);
                        var newLon = Convert.ToDouble(lonProp.CurrentValue ?? 0);

                        var distanceKm = HaversineKm(oldLat, oldLon, newLat, newLon);
                        if (distanceKm < LocationChangeThresholdKm)
                        {
                            changedProps.Remove(latProp);
                            changedProps.Remove(lonProp);
                        }
                    }

                    // Gerçekten değişen alan yoksa phantom-modification ya da
                    // yalnızca eşik-altı konum değişimi; log oluşturma
                    if (changedProps.Count == 0)
                        continue;

                    log.ChangedColumns = JsonSerializer.Serialize(
                        changedProps.Select(p => p.Metadata.Name).ToList());
                    log.OldValues = SerializeChangedValues(changedProps, useOriginal: true);
                    log.NewValues = SerializeChangedValues(changedProps, useOriginal: false);
                    break;
            }

            logs.Add(log);
        }

        return logs;
    }

    // ── Yardımcı metodlar ─────────────────────────────────────────────────────

    /// <summary>
    /// HTTP Context'ten JWT token içindeki UserId claim'ini okur.
    /// Token yoksa (arka plan servisleri, seed işlemleri) "System" döner.
    /// </summary>
    private string ResolveUserId()
    {
        return _httpContextAccessor.HttpContext?
            .User?
            .FindFirstValue(ClaimTypes.NameIdentifier)
            ?? "System";
    }

    /// <summary>
    /// Değişiklik türünü belirler.
    /// Özel durum: EntityState.Modified olup IsActive false'a çekiliyorsa SoftDelete olarak işaretlenir.
    /// </summary>
    private static AuditAction DetermineAction(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry)
    {
        if (entry.State == EntityState.Added)   return AuditAction.Insert;
        if (entry.State == EntityState.Deleted) return AuditAction.Delete;

        // Modified: soft delete kontrolü
        // IsActive property'si varsa ve false'a çekiliyorsa → SoftDelete
        var isActiveProp = entry.Properties.FirstOrDefault(p => p.Metadata.Name == "IsActive");
        if (isActiveProp is not null &&
            isActiveProp.IsModified &&
            isActiveProp.CurrentValue is false &&
            isActiveProp.OriginalValue is true)
        {
            return AuditAction.SoftDelete;
        }

        return AuditAction.Update;
    }

    /// <summary>
    /// Entity'nin birincil anahtar değerini string olarak döner.
    /// Bileşik PK'larda JSON formatı kullanılır.
    /// </summary>
    private static string GetEntityId(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry)
    {
        var keyValues = entry.Metadata
            .FindPrimaryKey()?
            .Properties
            .Select(p => entry.Property(p.Name).CurrentValue?.ToString() ?? "null")
            .ToList();

        if (keyValues is null || keyValues.Count == 0)
            return "unknown";

        return keyValues.Count == 1
            ? keyValues[0]
            : JsonSerializer.Serialize(keyValues);
    }

    /// <summary>
    /// Property değerlerini JSON'a dönüştürür.
    /// Hassas alanlar "[MASKED]" değeriyle gizlenir.
    /// </summary>
    private static string SerializeProperties(
        Microsoft.EntityFrameworkCore.ChangeTracking.PropertyValues values)
    {
        var dict = new Dictionary<string, object?>();

        foreach (var prop in values.Properties)
        {
            var value = _sensitiveProperties.Contains(prop.Name)
                ? "[MASKED]"
                : values[prop];

            dict[prop.Name] = value;
        }

        return JsonSerializer.Serialize(dict, new JsonSerializerOptions
        {
            WriteIndented = false
        });
    }

    /// <summary>
    /// Değişen property'lerin eski veya yeni değerlerini JSON olarak döner.
    /// Hassas alanlar "[MASKED]" ile gizlenir.
    /// </summary>
    private static string SerializeChangedValues(
        IEnumerable<Microsoft.EntityFrameworkCore.ChangeTracking.PropertyEntry> props,
        bool useOriginal)
    {
        var dict = new Dictionary<string, object?>();

        foreach (var p in props)
        {
            var raw = useOriginal ? p.OriginalValue : p.CurrentValue;
            dict[p.Metadata.Name] = _sensitiveProperties.Contains(p.Metadata.Name)
                ? "[MASKED]"
                : raw;
        }

        return JsonSerializer.Serialize(dict, new JsonSerializerOptions { WriteIndented = false });
    }

    /// <summary>
    /// double/float karşılaştırmasında kayan nokta hassasiyetini normalize eder;
    /// çok küçük farklar (epsilon altı) "değişmedi" sayılır.
    /// </summary>
    private static object? ConvertValue(object? value)
    {
        return value switch
        {
            double d => Math.Round(d, 10),
            float  f => Math.Round((double)f, 7),
            _        => value
        };
    }

    /// <summary>
    /// Haversine formülü ile iki GPS koordinatı arasındaki düzlem mesafesini kilometre cinsinden hesaplar.
    /// Yeryüzü yarıçapı: 6371 km (WGS-84 ortalama).
    /// </summary>
    private static double HaversineKm(
        double lat1, double lon1,
        double lat2, double lon2)
    {
        const double R = 6371.0; // Dünya yarıçapı (km)

        var dLat = (lat2 - lat1) * Math.PI / 180.0;
        var dLon = (lon2 - lon1) * Math.PI / 180.0;

        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(lat1 * Math.PI / 180.0)
              * Math.Cos(lat2 * Math.PI / 180.0)
              * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
    }
}
