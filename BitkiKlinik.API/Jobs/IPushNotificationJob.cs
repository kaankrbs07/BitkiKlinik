namespace BitkiKlinik.API.Jobs;

/// <summary>
/// Push bildirim gönderimi için Hangfire iş arayüzü.
/// </summary>
public interface IPushNotificationJob
{
    Task SendAsync(string expoPushToken, float riskPercentage, string suggestion);
}
