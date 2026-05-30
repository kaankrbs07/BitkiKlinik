using System;
using System.Linq;
using Microsoft.AspNetCore.Http;
using BitkiKlinik.API.Services.Interfaces;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// Dosyaları sunucunun yerel dosya sistemine (wwwroot/uploads) kaydeder.
/// Tüm dosya I/O işlemleri bu sınıfta izole edilmiştir;
/// controller ve iş servisleri dosya sistemiyle doğrudan etkileşime girmez.
/// </summary>
public class LocalFileStorageService : IFileStorageService
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<LocalFileStorageService> _logger;

    // ── Yapılandırma değerleri ────────────────────────────────────────────
    private readonly string _basePath;                     // ör: wwwroot/uploads
    private readonly long _maxFileSizeBytes;
    private readonly HashSet<string> _allowedExtensions;

    public LocalFileStorageService(
        IWebHostEnvironment env,
        IConfiguration configuration,
        ILogger<LocalFileStorageService> logger)
    {
        _env    = env;
        _logger = logger;

        // appsettings.json → FileStorage bölümünden okunur
        var section = configuration.GetSection("FileStorage");

        _basePath         = section["BasePath"] ?? "wwwroot/uploads";
        _maxFileSizeBytes = (long)(double.Parse(section["MaxFileSizeMb"] ?? "10") * 1024 * 1024);

        _allowedExtensions = section
            .GetSection("AllowedExtensions")
            .Get<string[]>()
            ?.Select(e => e.ToLowerInvariant())
            .ToHashSet()
            ?? new HashSet<string> { ".jpg", ".jpeg", ".png", ".webp" };
    }

    // ──────────────────────────────────────────────────────────────────────
    //  ValidateFile — Dosya boyut ve uzantı kontrolü
    // ──────────────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public void ValidateFile(IFormFile file)
    {
        if (file == null || file.Length == 0)
            throw new ArgumentException("Yüklenen dosya boş olamaz.");

        if (file.Length > _maxFileSizeBytes)
            throw new ArgumentException(
                $"Dosya boyutu {_maxFileSizeBytes / 1024 / 1024} MB sınırını aşıyor.");

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!_allowedExtensions.Contains(extension))
            throw new ArgumentException(
                $"Desteklenmeyen dosya türü: {extension}. " +
                $"İzin verilenler: {string.Join(", ", _allowedExtensions)}");

        // Güvenlik: Magic Number doğrulaması (Gerçek dosya içeriği analizi)
        ValidateImageSignature(file);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SaveFileAsync — GUID isimle diske yazar, göreli URL döndürür
    // ──────────────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<string> SaveFileAsync(IFormFile file, string subDirectory)
    {
        // 1. Validasyon
        ValidateFile(file);

        // 2. Fiziksel hedef klasörü oluştur  (ör: <root>/wwwroot/uploads/profiles)
        var physicalFolder = Path.Combine(_env.ContentRootPath, _basePath, subDirectory);
        Directory.CreateDirectory(physicalFolder);

        // 3. Benzersiz dosya adı üret → GUID + orijinal uzantı
        var extension  = Path.GetExtension(file.FileName).ToLowerInvariant();
        var uniqueName = $"{Guid.NewGuid()}{extension}";
        var fullPath   = Path.Combine(physicalFolder, uniqueName);

        // 4. Dosyayı asenkron olarak diske yaz
        await using var stream = new FileStream(
            fullPath, FileMode.Create, FileAccess.Write, FileShare.None);
        await file.CopyToAsync(stream);

        // 5. Göreli URL döndür (ör: /uploads/profiles/3f2a1b4c-…-5678.jpg)
        var relativeUrl = $"/uploads/{subDirectory}/{uniqueName}";

        _logger.LogInformation(
            "Dosya kaydedildi → Fiziksel: {Path}, URL: {Url}", fullPath, relativeUrl);

        return relativeUrl;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  DeleteFile — Eski dosyayı temizle (idempotent)
    // ──────────────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public void DeleteFile(string relativeUrl)
    {
        if (string.IsNullOrWhiteSpace(relativeUrl))
            return;

        // /uploads/profiles/abc.jpg → wwwroot/uploads/profiles/abc.jpg
        // relativeUrl başındaki "/" karakterini kaldır
        var relativePath = relativeUrl.TrimStart('/');
        var physicalPath = Path.Combine(_env.ContentRootPath, "wwwroot", relativePath);

        if (File.Exists(physicalPath))
        {
            File.Delete(physicalPath);
            _logger.LogInformation("Eski dosya silindi → {Path}", physicalPath);
        }
        else
        {
            _logger.LogWarning("Silinecek dosya bulunamadı → {Path}", physicalPath);
        }
    }

    /// <inheritdoc />
    public string GetFileUrl(string? relativeUrl)
    {
        if (string.IsNullOrWhiteSpace(relativeUrl))
            return string.Empty;

        // Yerel depolamada göreli URL'in kendisini döner.
        // Eğer "/" ile başlamıyorsa, başına "/" ekleriz.
        return relativeUrl.StartsWith('/') ? relativeUrl : $"/{relativeUrl}";
    }

    /// <inheritdoc />
    public Task MigrateLocalFilesAsync(string webRootPath)
    {
        // Yerel depolamada zaten yerel dosyalar kullanılmaktadır, işlem yapmaya gerek yoktur.
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public async Task<byte[]?> GetFileBytesAsync(string? relativeUrl)
    {
        if (string.IsNullOrWhiteSpace(relativeUrl))
            return null;

        var relativePath = relativeUrl.TrimStart('/');
        var physicalPath = Path.Combine(_env.ContentRootPath, "wwwroot", relativePath);

        if (File.Exists(physicalPath))
        {
            return await File.ReadAllBytesAsync(physicalPath);
        }

        return null;
    }

    /// <inheritdoc />
    public async Task<string> SaveFileBytesAsync(byte[] fileBytes, string fileName, string subDirectory)
    {
        if (fileBytes == null || fileBytes.Length == 0)
            throw new ArgumentException("Yazılacak dosya verisi boş olamaz.");

        // Fiziksel hedef klasörü oluştur
        var physicalFolder = Path.Combine(_env.ContentRootPath, _basePath, subDirectory);
        Directory.CreateDirectory(physicalFolder);

        // Benzersiz dosya adı üret
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(extension))
        {
            extension = ".jpg";
        }
        var uniqueName = $"{Guid.NewGuid()}{extension}";
        var fullPath = Path.Combine(physicalFolder, uniqueName);

        // Byte dizisini diske yaz
        await File.WriteAllBytesAsync(fullPath, fileBytes);

        var relativeUrl = $"/uploads/{subDirectory}/{uniqueName}";
        _logger.LogInformation("Dosya byte'ları diske kaydedildi → Fiziksel: {Path}, URL: {Url}", fullPath, relativeUrl);

        return relativeUrl;
    }

    /// <summary>
    /// İlk byte'ları okuyarak dosya formatını doğrular (magic number kontrolü).
    /// Uzantı sahteciliğine karşı koruma sağlar.
    /// </summary>
    public static void ValidateImageSignature(IFormFile file)
    {
        // Bilinen görsel format imzaları
        // Her dizi: beklenen byte dizisi + offset
        var signatures = new (byte[] Magic, int Offset)[]
        {
            // JPEG: FF D8 FF
            (new byte[] { 0xFF, 0xD8, 0xFF }, 0),
            // PNG: 89 50 4E 47 0D 0A 1A 0A
            (new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, 0),
            // WebP: RIFF????WEBP (offset 0 = RIFF, offset 8 = WEBP)
            (new byte[] { 0x52, 0x49, 0x46, 0x46 }, 0),   // RIFF prefix
            // GIF87a / GIF89a
            (new byte[] { 0x47, 0x49, 0x46, 0x38 }, 0),
        };

        using var stream = file.OpenReadStream();
        Span<byte> stackHeader = stackalloc byte[12];
        var bytesRead = stream.Read(stackHeader);

        if (bytesRead < 4)
            throw new ArgumentException("Dosya içeriği okunamıyor.");

        var header = stackHeader[..bytesRead].ToArray();

        var isValid = signatures.Any(sig =>
        {
            var (magic, offset) = sig;
            if (header.Length < offset + magic.Length) return false;

            // WebP ek kontrol: ilk 4 byte = RIFF, 8-11. byte = WEBP
            if (magic[0] == 0x52 && header.Length >= 12)
            {
                return header[..4].SequenceEqual(magic)
                    && header[8..12].SequenceEqual("WEBP"u8.ToArray());
            }

            return header.Skip(offset).Take(magic.Length).SequenceEqual(magic);
        });

        if (!isValid)
            throw new ArgumentException(
                "Dosya içeriği görsel formatıyla eşleşmiyor. " +
                "Zararlı veya geçersiz dosya (Magic Number uyumsuzluğu).");

        // IFormFile stream'i paylaşılmış olabilir; başa sar.
        stream.Position = 0;
    }
}
