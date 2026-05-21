using BitkiKlinik.API.Services.Interfaces;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using MimeKit;
using MimeKit.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using System.Threading.Tasks;

namespace BitkiKlinik.API.Services.Implementations;

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public EmailService(
        IConfiguration configuration, 
        ILogger<EmailService> logger,
        IServiceScopeFactory scopeFactory)
    {
        _configuration = configuration;
        _logger = logger;
        _scopeFactory = scopeFactory;
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

    public void SendEmailInBackground(string toAuthUserEmail, string subject, string htmlMessage)
    {
        // Don't await this; fire and forget
        _ = Task.Run(async () =>
        {
            try
            {
                // Create a new scope to resolve a fresh IEmailService
                using var scope = _scopeFactory.CreateScope();
                var scopedEmailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
                
                await scopedEmailService.SendEmailAsync(toAuthUserEmail, subject, htmlMessage);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Arka planda e-posta gönderilirken hata oluştu. Alıcı: {Email}", toAuthUserEmail);
            }
        });
    }
}