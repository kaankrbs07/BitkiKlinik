using Amazon.S3;
using Amazon.S3.Model;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// Dosyaları Backblaze B2 (S3 uyumlu bulut depolama) üzerinde saklar.
/// Arayüz kontratını bozmamak için yerel disk formatında (/uploads/...) URL döner.
/// Dosya talep edildiğinde ise geçici imzalı (pre-signed) S3 erişim URL'i üretir.
/// </summary>
public class B2FileStorageService : IFileStorageService
{
    private readonly ILogger<B2FileStorageService> _logger;
    private readonly AmazonS3Client _s3Client;

    private readonly string _bucketName;
    private readonly long _maxFileSizeBytes;
    private readonly HashSet<string> _allowedExtensions;
    private readonly double _preSignedUrlDurationHours;

    public B2FileStorageService(
        IConfiguration configuration,
        ILogger<B2FileStorageService> logger)
    {
        _logger = logger;

        var section = configuration.GetSection("FileStorage");
        var b2Section = section.GetSection("Backblaze");

        _bucketName = b2Section["BucketName"] ?? throw new ArgumentNullException("Backblaze:BucketName settings are missing.");
        var endpoint = b2Section["Endpoint"] ?? throw new ArgumentNullException("Backblaze:Endpoint settings are missing.");
        var keyId = b2Section["KeyId"] ?? throw new ArgumentNullException("Backblaze:KeyId settings are missing.");
        var applicationKey = b2Section["ApplicationKey"] ?? throw new ArgumentNullException("Backblaze:ApplicationKey settings are missing.");
        var region = b2Section["Region"] ?? "eu-central-003";

        _preSignedUrlDurationHours = double.Parse(b2Section["PreSignedUrlDurationHours"] ?? "24");
        _maxFileSizeBytes = (long)(double.Parse(section["MaxFileSizeMb"] ?? "10") * 1024 * 1024);

        _allowedExtensions = section
            .GetSection("AllowedExtensions")
            .Get<string[]>()
            ?.Select(e => e.ToLowerInvariant())
            .ToHashSet()
            ?? new HashSet<string> { ".jpg", ".jpeg", ".png", ".webp" };

        // Backblaze B2 için S3 uyumluluk yapılandırması
        var s3Config = new AmazonS3Config
        {
            ServiceURL = $"https://{endpoint}",
            ForcePathStyle = true // B2 uyumluluğu için zorunludur
        };

        _s3Client = new AmazonS3Client(keyId, applicationKey, s3Config);
    }

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
        LocalFileStorageService.ValidateImageSignature(file);
    }

    /// <inheritdoc />
    public async Task<string> SaveFileAsync(IFormFile file, string subDirectory)
    {
        ValidateFile(file);

        // 1. Benzersiz dosya adı ve B2 nesne anahtarı (key) üret
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var uniqueName = $"{Guid.NewGuid()}{extension}";
        
        // Örn: profiles/abc-123.jpg veya scans/xyz-789.png
        var key = $"{subDirectory}/{uniqueName}".Replace("\\", "/");

        // 2. Dosyayı Backblaze B2'ye yükle
        using var stream = file.OpenReadStream();
        var putRequest = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = key,
            InputStream = stream,
            ContentType = file.ContentType
        };

        await _s3Client.PutObjectAsync(putRequest);

        // 3. Veri tabanı ve diğer servislerin yerel disk gibi algılaması için standart yolu dön
        var relativeUrl = $"/uploads/{subDirectory}/{uniqueName}";
        
        _logger.LogInformation("Dosya Backblaze B2'ye yüklendi → Bucket: {Bucket}, Key: {Key}, URL: {Url}", 
            _bucketName, key, relativeUrl);

        return relativeUrl;
    }

    /// <inheritdoc />
    public void DeleteFile(string relativeUrl)
    {
        if (string.IsNullOrWhiteSpace(relativeUrl))
            return;

        try
        {
            // /uploads/profiles/abc.jpg -> profiles/abc.jpg
            var key = ExtractKeyFromRelativeUrl(relativeUrl);

            // Arayüz metodunun imzası senkron olduğu için asenkron silme işlemini sarmallıyoruz
            Task.Run(async () =>
            {
                var deleteRequest = new DeleteObjectRequest
                {
                    BucketName = _bucketName,
                    Key = key
                };
                await _s3Client.DeleteObjectAsync(deleteRequest);
                _logger.LogInformation("Eski dosya Backblaze B2'den silindi → Bucket: {Bucket}, Key: {Key}", _bucketName, key);
            }).GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Backblaze B2'den dosya silinirken hata oluştu: {Url}", relativeUrl);
        }
    }

    /// <inheritdoc />
    public string GetFileUrl(string? relativeUrl)
    {
        if (string.IsNullOrWhiteSpace(relativeUrl))
            return string.Empty;

        try
        {
            // B2 Nesne anahtarını çıkar (Örn: /uploads/profiles/abc.jpg -> profiles/abc.jpg)
            var key = ExtractKeyFromRelativeUrl(relativeUrl);

            var request = new GetPreSignedUrlRequest
            {
                BucketName = _bucketName,
                Key = key,
                Expires = DateTime.UtcNow.AddHours(_preSignedUrlDurationHours)
            };

            return _s3Client.GetPreSignedURL(request);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Geçici Backblaze URL'i üretilirken hata oluştu: {Url}", relativeUrl);
            return relativeUrl; // Hata durumunda en azından orijinal URL'i geri dön
        }
    }

    /// <inheritdoc />
    public async Task MigrateLocalFilesAsync(string webRootPath)
    {
        var uploadsPath = Path.Combine(webRootPath, "uploads");
        if (!Directory.Exists(uploadsPath))
        {
            _logger.LogWarning("Yerel 'uploads' klasörü bulunamadı: {Path}. Taşıma işlemi atlanıyor.", uploadsPath);
            return;
        }

        var subDirs = new[] { "profiles", "scans" };
        foreach (var subDir in subDirs)
        {
            var localSubDirPath = Path.Combine(uploadsPath, subDir);
            if (!Directory.Exists(localSubDirPath))
                continue;

            var files = Directory.GetFiles(localSubDirPath);
            if (files.Length == 0)
                continue;

            _logger.LogInformation("Yerel klasördeki dosyalar Backblaze B2'ye taşınıyor: {Dir} ({Count} adet dosya)", subDir, files.Length);

            foreach (var filePath in files)
            {
                var fileName = Path.GetFileName(filePath);
                var key = $"{subDir}/{fileName}".Replace("\\", "/");

                try
                {
                    // Dosyanın B2'de zaten var olup olmadığını metadata çekerek hızlıca kontrol et (Idempotency)
                    await _s3Client.GetObjectMetadataAsync(_bucketName, key);
                    _logger.LogDebug("Dosya zaten Backblaze B2 üzerinde mevcut, atlanıyor: {Key}", key);
                }
                catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    // Dosya B2'de bulunamadı, yükleyelim
                    _logger.LogInformation("Dosya Backblaze B2'ye yükleniyor (Taşıma): {Key}", key);
                    try
                    {
                        using var stream = File.OpenRead(filePath);
                        var putRequest = new PutObjectRequest
                        {
                            BucketName = _bucketName,
                            Key = key,
                            InputStream = stream
                        };
                        await _s3Client.PutObjectAsync(putRequest);
                    }
                    catch (Exception uploadEx)
                    {
                        _logger.LogError(uploadEx, "Dosya Backblaze B2'ye taşınırken yükleme hatası oluştu: {Path}", filePath);
                    }
                }
                catch (Exception checkEx)
                {
                    _logger.LogError(checkEx, "Dosya B2 kontrolü sırasında hata oluştu: {Key}", key);
                }
            }
        }
    }

    /// <inheritdoc />
    public async Task<byte[]?> GetFileBytesAsync(string? relativeUrl)
    {
        if (string.IsNullOrWhiteSpace(relativeUrl))
            return null;

        try
        {
            var key = ExtractKeyFromRelativeUrl(relativeUrl);
            var getRequest = new GetObjectRequest
            {
                BucketName = _bucketName,
                Key = key
            };

            using var response = await _s3Client.GetObjectAsync(getRequest);
            using var ms = new MemoryStream();
            await response.ResponseStream.CopyToAsync(ms);
            return ms.ToArray();
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            _logger.LogWarning("Okunacak dosya Backblaze B2'de bulunamadı: {Url}", relativeUrl);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Backblaze B2'den dosya byte verileri okunurken hata oluştu: {Url}", relativeUrl);
            return null;
        }
    }

    /// <inheritdoc />
    public async Task<string> SaveFileBytesAsync(byte[] fileBytes, string fileName, string subDirectory)
    {
        if (fileBytes == null || fileBytes.Length == 0)
            throw new ArgumentException("Yazılacak dosya verisi boş olamaz.");

        // 1. Benzersiz dosya adı ve B2 nesne anahtarı (key) üret
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(extension))
        {
            extension = ".jpg";
        }
        var uniqueName = $"{Guid.NewGuid()}{extension}";
        var key = $"{subDirectory}/{uniqueName}".Replace("\\", "/");

        // 2. Dosyayı Backblaze B2'ye yükle
        using var ms = new MemoryStream(fileBytes);
        var putRequest = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = key,
            InputStream = ms,
            ContentType = GetContentType(extension)
        };

        await _s3Client.PutObjectAsync(putRequest);

        var relativeUrl = $"/uploads/{subDirectory}/{uniqueName}";
        _logger.LogInformation("Dosya byte verisi Backblaze B2'ye yüklendi → Bucket: {Bucket}, Key: {Key}, URL: {Url}", 
            _bucketName, key, relativeUrl);

        return relativeUrl;
    }

    private string GetContentType(string extension)
    {
        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "application/octet-stream"
        };
    }

    private string ExtractKeyFromRelativeUrl(string relativeUrl)
    {
        // /uploads/profiles/abc.jpg or uploads/profiles/abc.jpg -> profiles/abc.jpg
        var cleanUrl = relativeUrl.TrimStart('/');
        
        if (cleanUrl.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase))
        {
            cleanUrl = cleanUrl.Substring("uploads/".Length);
        }
        
        return cleanUrl.Replace("\\", "/");
    }
}
