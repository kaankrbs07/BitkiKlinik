using System.Threading.Tasks;

namespace BitkiKlinik.API.Services.Interfaces;

public interface IEmailService
{
    Task SendEmailAsync(string toAuthUserEmail, string subject, string htmlMessage);
    void SendEmailInBackground(string toAuthUserEmail, string subject, string htmlMessage);
}
