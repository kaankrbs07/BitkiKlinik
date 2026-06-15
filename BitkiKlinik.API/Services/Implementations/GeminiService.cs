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
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTime> _unhealthyModels = new();
    private static readonly TimeSpan _cooldownDuration = TimeSpan.FromMinutes(2);

    public static void ClearUnhealthyModelsForTesting()
    {
        _unhealthyModels.Clear();
    }

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
        int delayMs = 500; // 0.5 saniye başlangıç gecikmesi

        // Hata durumunda sırasıyla denenecek model zinciri: Gemini 3.5 Flash -> Gemini 3.1 Flash Lite -> Gemini 2.5 Flash
        var modelsToTry = new List<string>();
        var preferredOrder = new List<string> { "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash" };

        if (!preferredOrder.Contains(_model) && !string.IsNullOrEmpty(_model))
        {
            modelsToTry.Add(_model);
        }
        modelsToTry.AddRange(preferredOrder);

        // Sağlıklı (soğuma süresinde olmayan) modelleri filtrele
        var now = DateTime.UtcNow;
        var healthyModels = modelsToTry
            .Where(m => !_unhealthyModels.TryGetValue(m, out var cooldownUntil) || now > cooldownUntil)
            .ToList();

        // Eğer tüm modeller sağlıksız durumdaysa, tamamını denemeye devam et (fail-open)
        if (!healthyModels.Any())
        {
            healthyModels = modelsToTry;
        }

        for (int attempt = 1; attempt <= maxRetries; attempt++)
        {
            string activeModel = healthyModels[Math.Min(attempt - 1, healthyModels.Count - 1)];
            bool shouldDelay = true;

            try
            {
                var requestUrl = $"{_baseUrl.TrimEnd('/')}/v1beta/models/{activeModel}:generateContent?key={_apiKey}";
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                _logger.LogInformation("Gemini API'sine istek gönderiliyor. Model: {Model} (Deneme {Attempt}/{MaxRetries})", activeModel, attempt, maxRetries);
                
                // İlk denemeler için kısa timeout (3sn), son deneme için uzun timeout (15sn)
                var timeoutSeconds = (attempt == maxRetries) ? 15 : 3;
                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));
                var response = await client.PostAsync(requestUrl, content, cts.Token);

                if (response.IsSuccessStatusCode)
                {
                    // Başarılı istekte modelin varsa sağlıksız durumunu kaldır
                    _unhealthyModels.TryRemove(activeModel, out _);

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

                // Hata veren modeli sağlıksız olarak işaretle
                _unhealthyModels[activeModel] = DateTime.UtcNow.Add(_cooldownDuration);

                // 400, 401, 403, 404 gibi istemci hatalarında beklemeye gerek yok
                if (response.StatusCode == System.Net.HttpStatusCode.BadRequest ||
                    response.StatusCode == System.Net.HttpStatusCode.Unauthorized ||
                    response.StatusCode == System.Net.HttpStatusCode.Forbidden ||
                    response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    shouldDelay = false;
                }

                if (attempt == maxRetries)
                {
                    throw new HttpRequestException($"Yapay zeka servisi yoğunluk/hata nedeniyle yanıt veremiyor. Son denenen model: {activeModel}, Hata kodu: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                // Yakalanan tüm hatalarda modeli sağlıksız olarak işaretle
                _unhealthyModels[activeModel] = DateTime.UtcNow.Add(_cooldownDuration);

                if (attempt == maxRetries)
                {
                    throw; // Son denemede hatayı fırlat
                }

                _logger.LogWarning(ex, "Gemini API çağrısı sırasında hata oluştu. Bir sonraki model denenecek.");
            }

            if (shouldDelay && attempt < maxRetries)
            {
                // Üstel bekleme süresi (exponential backoff)
                await Task.Delay(delayMs * attempt);
            }
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
