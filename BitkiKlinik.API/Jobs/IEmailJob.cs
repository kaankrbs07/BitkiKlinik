namespace BitkiKlinik.API.Jobs;

/// <summary>
/// E-posta gönderimi için Hangfire iş arayüzü.
/// Hangfire bu arayüzü DI aracılığıyla çözümler ve işi arka planda çalıştırır.
/// Başarısız işler otomatik olarak yeniden denenir (varsayılan: 10 kez, üstel bekleme).
/// </summary>
public interface IEmailJob
{
    Task SendAsync(string to, string subject, string html);
}
