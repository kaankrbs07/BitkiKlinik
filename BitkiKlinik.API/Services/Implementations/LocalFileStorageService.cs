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
}
