using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.Extensions.Logging;

namespace BitkiKlinik.API.Services.Implementations;

public class WeatherService : IWeatherService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<WeatherService> _logger;

    public WeatherService(IHttpClientFactory httpClientFactory, ILogger<WeatherService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<WeatherForecastData?> GetHourlyForecastAsync(double latitude, double longitude)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Add("User-Agent", "BitkiKlinik-App/1.0");

            var url = $"https://api.open-meteo.com/v1/forecast?latitude={latitude.ToString(System.Globalization.CultureInfo.InvariantCulture)}&longitude={longitude.ToString(System.Globalization.CultureInfo.InvariantCulture)}&hourly=temperature_2m,relative_humidity_2m&timezone=auto";
            _logger.LogInformation("Open-Meteo API çağrısı yapılıyor: {Url}", url);

            var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Open-Meteo API hatası: {StatusCode}", response.StatusCode);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync();
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            var data = JsonSerializer.Deserialize<WeatherForecastData>(json, options);
            return data;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Open-Meteo hava durumu verisi çekilirken beklenmeyen bir hata oluştu.");
            return null;
        }
    }
}
