using BitkiKlinik.API.Jobs;
using BitkiKlinik.API.Services.Interfaces;
using Hangfire;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using MimeKit;
using MimeKit.Text;
using Microsoft.Extensions.Logging;

namespace BitkiKlinik.API.Services.Implementations;

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;

    public EmailService(
        IConfiguration configuration, 
        ILogger<EmailService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task SendEmailAsync(string toAuthUserEmail, string subject, string htmlMessage)
    {
        var email = new MimeMessage();
        var senderEmail = _configuration["SMTP:SenderEmail"] ?? string.Empty;
        var senderName = _configuration["SMTP:SenderName"] ?? "Bitki Klinik";
        
        email.From.Add(new MailboxAddress(senderName, senderEmail));
        email.To.Add(MailboxAddress.Parse(toAuthUserEmail));
        email.Subject = subject;
        email.Body = new TextPart(TextFormat.Html) { Text = htmlMessage };

        using var smtp = new SmtpClient();
        
        var host = _configuration["SMTP:Host"] ?? string.Empty;
        var port = int.Parse(_configuration["SMTP:Port"] ?? "587");
        var useSsl = bool.Parse(_configuration["SMTP:UseSsl"] ?? "false");
        
        // Port 465 genellikle SslOnConnect gerektirir, 587 ise StartTls.
        var socketOptions = useSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;

        await smtp.ConnectAsync(host, port, socketOptions);
        await smtp.AuthenticateAsync(_configuration["SMTP:Username"] ?? string.Empty, _configuration["SMTP:Password"] ?? string.Empty);
        await smtp.SendAsync(email);
        await smtp.DisconnectAsync(true);
    }

    /// <summary>
    /// E-postayı Hangfire arka plan kuyruğuna ekler.
    /// Task.Run'ın aksine:
    /// - Görev SQL Server'da kalıcı olarak saklanır (uygulama yeniden başlasa bile kaybolmaz).
    /// - Başarısız gönderimler otomatik yeniden denenir (EmailJob içindeki AutomaticRetry ile).
    /// - Hangfire Dashboard'dan izlenebilir.
    /// </summary>
    public void SendEmailInBackground(string toAuthUserEmail, string subject, string htmlMessage)
    {
        BackgroundJob.Enqueue<IEmailJob>(job => job.SendAsync(toAuthUserEmail, subject, htmlMessage));
        _logger.LogInformation("E-posta Hangfire kuyruğuna eklendi. Alıcı: {Email}", toAuthUserEmail);
    }
}