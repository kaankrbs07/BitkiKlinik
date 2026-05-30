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
    private readonly IFileStorageService _fileStorageService;

    // ── Konfigürasyon değerleri ───────────────────────────────────────────────
    private readonly string _analyzeEndpoint;

    public PlantAnalysisService(
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment env,
        IConfiguration configuration,
        ILogger<PlantAnalysisService> logger,
        IActiveLearningService activeLearningService,
        IFileStorageService fileStorageService)
    {
        _httpClientFactory = httpClientFactory;
        _env               = env;
        _logger            = logger;
        _activeLearningService = activeLearningService;
        _configuration      = configuration;
        _fileStorageService = fileStorageService;

        // appsettings.json → PythonApi
        var pythonSection  = configuration.GetSection("PythonApi");
        // Sadece göreli yol saklanır; named client'in BaseAddress'i baz URL'i sağlıyor.
        _analyzeEndpoint   = pythonSection["AnalyzeEndpoint"] ?? "/analyze";
    }

    // ── Ana iş akışı ─────────────────────────────────────────────────────────
    public async Task<PlantAnalysisResultDTO> AnalyzeAsync(IFormFile image)
    {
        // 1. Dosya validasyonu
        ValidateFile(image);

        // 2. Görseli depolama servisi ile kaydet → göreli URL üret
        var imageUrl = await _fileStorageService.SaveFileAsync(image, "scans");

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
        // Depolama servisinin genel validasyonunu çağır.
        // Bu çağrı artık LocalFileStorageService üzerinden Magic-byte doğrulamasını da içerir.
        _fileStorageService.ValidateFile(image);
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
