using System.Net.Http.Headers;
using System.Text.Json;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.Extensions.Configuration;

namespace BitkiKlinik.API.Services.Implementations;

public class PlantAnalysisService : IPlantAnalysisService
{
    // ── Sabitler ────────────────────────────────────────────────────────────
    private const string HttpClientName = "PythonApiClient";

    // ── Bağımlılıklar ────────────────────────────────────────────────────────
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<PlantAnalysisService> _logger;
    private readonly IActiveLearningService _activeLearningService;
    private readonly IConfiguration _configuration;

    // ── Konfigürasyon değerleri ───────────────────────────────────────────────
    private readonly string _analyzeEndpoint;
    private readonly string _uploadPath;          // fiziksel klasör (wwwroot/uploads/scans)
    private readonly long   _maxFileSizeBytes;
    private readonly HashSet<string> _allowedExtensions;

    public PlantAnalysisService(
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment env,
        IConfiguration configuration,
        ILogger<PlantAnalysisService> logger,
        IActiveLearningService activeLearningService)
    {
        _httpClientFactory = httpClientFactory;
        _env               = env;
        _logger            = logger;
        _activeLearningService = activeLearningService;
        _configuration      = configuration;

        // appsettings.json → PythonApi
        var pythonSection  = configuration.GetSection("PythonApi");
        // Sadece göreli yol saklanır; named client'in BaseAddress'i baz URL'i sağlıyor.
        _analyzeEndpoint   = pythonSection["AnalyzeEndpoint"] ?? "/analyze";

        // appsettings.json → FileStorage
        var storageSection = configuration.GetSection("FileStorage");
        _uploadPath        = storageSection["UploadPath"] ?? "wwwroot/uploads/scans";
        _maxFileSizeBytes  = (long)(double.Parse(storageSection["MaxFileSizeMb"] ?? "10") * 1024 * 1024);

        _allowedExtensions = storageSection
            .GetSection("AllowedExtensions")
            .Get<string[]>()
            ?.Select(e => e.ToLowerInvariant())
            .ToHashSet()
            ?? new HashSet<string> { ".jpg", ".jpeg", ".png", ".webp" };
    }

    // ── Ana iş akışı ─────────────────────────────────────────────────────────
    public async Task<PlantAnalysisResultDTO> AnalyzeAsync(IFormFile image)
    {
        // 1. Dosya validasyonu
        ValidateFile(image);

        // 2. Görseli yerel diske kaydet → göreli URL üret
        var imageUrl = await SaveFileAsync(image);

        // 3. IFormFile stream'ini doğrudan Python API'ye ilet (diskten okuma yok)
        var pythonResponse = await ForwardToPythonAsync(image);

        _logger.LogInformation(
            "Analiz tamamlandı. Etiket: {Label}, Güven: {Confidence:P1}, Görsel: {Url}",
            pythonResponse.Disease, pythonResponse.Confidence, imageUrl);

        var result = new PlantAnalysisResultDTO
        {
            ModelLabel = pythonResponse.Disease,
            Confidence = pythonResponse.Confidence,
            ImageUrl   = imageUrl
        };

        return result;
    }

    // ── Özel yardımcı metodlar ────────────────────────────────────────────────

    /// <summary>
    /// Uzantı, boyut ve içerik türü kontrollerini yapar.
    /// </summary>
    private void ValidateFile(IFormFile image)
    {
        if (image.Length == 0)
            throw new ArgumentException("Yüklenen dosya boş olamaz.");

        if (image.Length > _maxFileSizeBytes)
            throw new ArgumentException($"Dosya boyutu {_maxFileSizeBytes / 1024 / 1024} MB sınırını aşıyor.");

        var extension = Path.GetExtension(image.FileName).ToLowerInvariant();
        if (!_allowedExtensions.Contains(extension))
            throw new ArgumentException($"Desteklenmeyen dosya türü: {extension}. İzin verilenler: {string.Join(", ", _allowedExtensions)}");

        // Magic-byte doğrulaması: sadece uzantıya değil, dosyanın gerçek içeriğine bak.
        // Bu, .jpg olarak yeniden adlandırılmış SVG veya binary dosyaları engeller.
        ValidateFileSignature(image);
    }

    /// <summary>
    /// İlk byte'ları okuyarak dosya formatını doğrular (magic number kontrolü).
    /// Uzantı sahteciliğine karşı koruma sağlar.
    /// </summary>
    private static void ValidateFileSignature(IFormFile file)
    {
        // Bilinen görsel format imzaları
        // Her dizi: beklenen byte dizisi + offset (bazı format imzaları 0. byte'tan başlamaz)
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

        // stackalloc değişkeni lambda'da kullanılamaz — managed diziye kopyala
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
                "Lütfen geçerli bir JPEG, PNG veya WebP dosyası yükleyin.");

        // IFormFile stream'i paylaşılmış olabilir; başa sar.
        stream.Position = 0;
    }


    /// <summary>
    /// Dosyayı wwwroot/uploads/scans/ altına GUID ismiyle kaydeder.
    /// Mobil uygulamanın erişebileceği göreli URL'i döndürür.
    /// </summary>
    private async Task<string> SaveFileAsync(IFormFile image)
    {
        // Fiziksel hedef klasörü oluştur (yoksa)
        var physicalFolder = Path.Combine(_env.ContentRootPath, _uploadPath);
        Directory.CreateDirectory(physicalFolder);

        // Benzersiz dosya adı: GUID + orijinal uzantı
        var extension = Path.GetExtension(image.FileName).ToLowerInvariant();
        var uniqueName = $"{Guid.NewGuid()}{extension}";
        var physicalPath = Path.Combine(physicalFolder, uniqueName);

        await using var fileStream = new FileStream(physicalPath, FileMode.Create, FileAccess.Write, FileShare.None);
        await image.CopyToAsync(fileStream);

        // Göreli URL (mobil uygulamanın çekebileceği endpoint formatı)
        // Örn: /uploads/scans/3f2a1b4c-abcd-1234-efgh-5678ijkl.jpg
        return $"/uploads/scans/{uniqueName}";
    }

    /// <summary>
    /// IFormFile'ın stream'ini diskten okumadan doğrudan Python API'ye POST eder.
    /// IHttpClientFactory ile named client kullanır.
    /// </summary>
    private async Task<PythonAnalysisResponseDTO> ForwardToPythonAsync(IFormFile image)
    {
        var client = _httpClientFactory.CreateClient(HttpClientName);

        // IFormFile.OpenReadStream() → stream doğrudan StreamContent'e bağlanır
        // Dosyayı bir kez diske yazdık, bir kez de stream'den Python'a aktarıyoruz
        await using var stream = image.OpenReadStream();

        using var formData = new MultipartFormDataContent();
        var streamContent = new StreamContent(stream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue(image.ContentType);

        // Python FastAPI tarafında beklenen form field adı: "file"
        formData.Add(streamContent, "file", image.FileName);

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync(_analyzeEndpoint, formData);
        }
        catch (TaskCanceledException)
        {
            throw new HttpRequestException("Python AI servisi zaman aşımına uğradı. Lütfen daha sonra tekrar deneyin.");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Python API'ye bağlanılamadı: {Endpoint}", _analyzeEndpoint);
            throw new HttpRequestException("Yapay zeka analiz servisine şu anda ulaşılamıyor.", ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            _logger.LogWarning("Python API hata döndürdü. Status: {Status}, Body: {Body}",
                response.StatusCode, errorBody);
            throw new HttpRequestException($"Analiz servisi hata döndürdü: {response.StatusCode}");
        }

        var json = await response.Content.ReadAsStringAsync();

        var result = JsonSerializer.Deserialize<PythonAnalysisResponseDTO>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (result is null)
            throw new InvalidOperationException("Python API'den geçersiz JSON yanıtı alındı.");

        return result;
    }
}
