using BitkiKlinik.API.Services.Interfaces;
using Hangfire;

namespace BitkiKlinik.API.Jobs;

/// <summary>
/// Hangfire tarafından arka planda çalıştırılan e-posta gönderici job sınıfı.
///
/// Avantajları (Task.Run karşılaştırması):
/// - Otomatik yeniden deneme: Başarısız gönderimlerde 10 kez, üstel bekleme ile tekrar dener.
/// - Kalıcılık: Uygulama yeniden başlasa bile bekleyen işler SQL Server'da saklanır.
/// - Görünürlük: Hangfire Dashboard üzerinden tüm geçmiş ve hata detayları izlenir.
/// - Sıra yönetimi: Eş zamanlı çok sayıda e-posta gönderimini sıraya alarak server'ı korur.
/// </summary>
[AutomaticRetry(Attempts = 5, DelaysInSeconds = [30, 60, 120, 300, 600])]
public class EmailJob : IEmailJob
{
    private readonly IEmailService _emailService;
    private readonly ILogger<EmailJob> _logger;

    public EmailJob(IEmailService emailService, ILogger<EmailJob> logger)
    {
        _emailService = emailService;
        _logger       = logger;
    }

    public async Task SendAsync(string to, string subject, string html)
    {
        _logger.LogInformation("Hangfire e-posta işi çalışıyor. Alıcı: {To}, Konu: {Subject}", to, subject);

        try
        {
            await _emailService.SendEmailAsync(to, subject, html);
            _logger.LogInformation("E-posta başarıyla gönderildi. Alıcı: {To}", to);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "E-posta gönderiminde hata. Alıcı: {To}, Konu: {Subject}", to, subject);
            throw; // Hangfire'ın yeniden deneme mekanizmasının devreye girmesi için fırlatılmalı
        }
    }
}
