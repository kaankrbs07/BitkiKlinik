using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// Google Gemini API (gemini-2.5-flash) entegrasyon servisi.
/// </summary>
public class GeminiService : IGeminiService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GeminiService> _logger;
    private readonly string _apiKey;
    private readonly string _baseUrl;
    private readonly string _model;

    public GeminiService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<GeminiService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;

        var geminiSection = configuration.GetSection("Gemini");
        
        // Önce appsettings.json'a, yoksa ortam değişkenlerine bak (GEMINI_API_KEY)
        _apiKey = geminiSection["ApiKey"] ?? string.Empty;
        if (string.IsNullOrEmpty(_apiKey) || _apiKey == "YOUR_GEMINI_API_KEY")
        {
            _apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY") ?? string.Empty;
        }

        _baseUrl = geminiSection["BaseUrl"] ?? "https://generativelanguage.googleapis.com";
        _model = geminiSection["Model"] ?? "gemini-2.5-flash";
    }

    public async Task<string> GenerateChatResponseAsync(string systemInstruction, IEnumerable<ChatMessageDTO> chatHistory)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogError("Gemini API Anahtarı (ApiKey) eksik veya geçersiz. Lütfen yapılandırmayı kontrol edin.");
            throw new InvalidOperationException("Yapay zeka servisinin API anahtarı ayarlanmamış.");
        }

        var client = _httpClientFactory.CreateClient();
        
        // Gemini API formatına dönüştür
        var contents = chatHistory.Select(msg => new GeminiContent
        {
            Role = msg.Role.ToLowerInvariant() == "model" ? "model" : "user",
            Parts = new List<GeminiPart> { new() { Text = msg.Content } }
        }).ToList();

        var requestBody = new GeminiRequest
        {
            Contents = contents,
            SystemInstruction = new GeminiSystemInstruction
            {
                Parts = new List<GeminiPart> { new() { Text = systemInstruction } }
            }
        };

        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        var jsonPayload = JsonSerializer.Serialize(requestBody, jsonOptions);
        
        int maxRetries = 3;
        int delayMs = 1500; // 1.5 saniye başlangıç gecikmesi

        // Hata durumunda sırasıyla denenecek model zinciri
        var modelsToTry = new List<string> { _model };
        if (_model != "gemini-3.5-flash") modelsToTry.Add("gemini-3.5-flash");
        if (_model != "gemini-3-flash") modelsToTry.Add("gemini-3-flash");
        modelsToTry.Add("gemini-3.0-flash"); // Farklı API sürümleriyle uyumluluk için alternatif isim

        for (int attempt = 1; attempt <= maxRetries; attempt++)
        {
            string activeModel = modelsToTry[Math.Min(attempt - 1, modelsToTry.Count - 1)];

            try
            {
                var requestUrl = $"{_baseUrl.TrimEnd('/')}/v1beta/models/{activeModel}:generateContent?key={_apiKey}";
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                _logger.LogInformation("Gemini API'sine istek gönderiliyor. Model: {Model} (Deneme {Attempt}/{MaxRetries})", activeModel, attempt, maxRetries);
                var response = await client.PostAsync(requestUrl, content);

                if (response.IsSuccessStatusCode)
                {
                    var responseJson = await response.Content.ReadAsStringAsync();
                    var geminiResponse = JsonSerializer.Deserialize<GeminiResponse>(responseJson, jsonOptions);
                    var reply = geminiResponse?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text;

                    if (string.IsNullOrEmpty(reply))
                    {
                        _logger.LogWarning("Gemini API'den boş yanıt döndü. Model: {Model}", activeModel);
                        return "Üzgünüm, şu anda yanıt üretemiyorum. Lütfen tekrar deneyin.";
                    }

                    return reply;
                }

                // Hata oluştu (Geçici ya da kalıcı fark etmeksizin, diğer modele geçmek üzere logla)
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Gemini API hata döndürdü. Kod: {StatusCode}, Model: {Model}, Detay: {Detail}. Deneme: {Attempt}/{MaxRetries}", 
                    response.StatusCode, activeModel, errorContent, attempt, maxRetries);

                if (attempt == maxRetries)
                {
                    throw new HttpRequestException($"Yapay zeka servisi yoğunluk/hata nedeniyle yanıt veremiyor. Son denenen model: {activeModel}, Hata kodu: {response.StatusCode}");
                }
            }
            catch (Exception ex) when (attempt < maxRetries)
            {
                _logger.LogWarning(ex, "Gemini API çağrısı sırasında hata oluştu. Bir sonraki model denenecek. Bekleme süresi: {Delay}ms", delayMs * attempt);
            }

            // Üstel bekleme süresi (exponential backoff)
            await Task.Delay(delayMs * attempt);
        }

        throw new HttpRequestException("Yapay zeka servisi istek zaman aşımı.");
    }

    #region Gemini API JSON Mappings

    private class GeminiRequest
    {
        public List<GeminiContent> Contents { get; set; } = new();
        public GeminiSystemInstruction? SystemInstruction { get; set; }
    }

    private class GeminiContent
    {
        public string Role { get; set; } = string.Empty;
        public List<GeminiPart> Parts { get; set; } = new();
    }

    private class GeminiSystemInstruction
    {
        public List<GeminiPart> Parts { get; set; } = new();
    }

    private class GeminiPart
    {
        public string Text { get; set; } = string.Empty;
    }

    private class GeminiResponse
    {
        public List<GeminiCandidate>? Candidates { get; set; }
    }

    private class GeminiCandidate
    {
        public GeminiContent? Content { get; set; }
        public string? FinishReason { get; set; }
    }

    #endregion
}
