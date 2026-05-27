using System.Net.Http.Json;
using Hangfire;

namespace BitkiKlinik.API.Jobs;

/// <summary>
/// Hangfire tarafından arka planda çalıştırılan Expo Push Notification gönderici job sınıfı.
///
/// Neden Task.Run yerine Hangfire?
/// - 10.000 kullanıcı için push gönderiminde bir hata olduğunda Hangfire işi kaydetmez;
///   SQL Server'da bekletir ve yeniden dener.
/// - Uygulama yeniden başlasa bile bekleyen push'lar gönderilir.
/// - Dashboard'da her bildirim için "başarılı / hatalı / bekliyor" durumu izlenir.
/// </summary>
[AutomaticRetry(Attempts = 3, DelaysInSeconds = [60, 180, 600])]
public class PushNotificationJob : IPushNotificationJob
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PushNotificationJob> _logger;

    private const string ExpoApiUrl = "https://exp.host/--/api/v2/push/send";

    public PushNotificationJob(IHttpClientFactory httpClientFactory, ILogger<PushNotificationJob> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger            = logger;
    }

    public async Task SendAsync(string expoPushToken, float riskPercentage, string suggestion)
    {
        _logger.LogInformation("Hangfire push bildirimi işi çalışıyor. Token: {Token}", expoPushToken);

        var client = _httpClientFactory.CreateClient();
        var payload = new
        {
            to    = expoPushToken,
            sound = "default",
            title = "Kritik Mantar Hastalığı Riski! ⚠️",
            body  = $"Tarlanızda Mildiyö riski %{riskPercentage} seviyesine ulaştı. Önlem: {suggestion}",
            data  = new { screen = "home" }
        };

        var response = await client.PostAsJsonAsync(ExpoApiUrl, payload);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Push bildirimi başarıyla gönderildi. Token: {Token}", expoPushToken);
        }
        else
        {
            var errorText = await response.Content.ReadAsStringAsync();
            _logger.LogWarning("Push bildirimi başarısız. Hata: {Error}", errorText);

            // Hangfire yeniden deneme için exception fırlat
            throw new HttpRequestException(
                $"Expo Push API hata döndürdü: {response.StatusCode}. Detay: {errorText}");
        }
    }
}
