using System;

namespace BitkiKlinik.API.Services.Helpers;

/// <summary>
/// Kullanıcılara gönderilecek e-postalar için zengin ve modern HTML şablonları üretir.
/// </summary>
public static class EmailTemplateHelper
{
    /// <summary>
    /// Doğrulama kodu (OTP) içeren e-postalar için botanik temalı modern bir HTML şablonu üretir.
    /// </summary>
    /// <param name="username">Kullanıcı adı</param>
    /// <param name="title">E-posta başlığı (H2)</param>
    /// <param name="code">Doğrulama kodu (OTP)</param>
    /// <param name="description">Kodun amacını açıklayan detay metni</param>
    /// <param name="expiryMinutes">Kodun geçerlilik süresi (dakika)</param>
    /// <returns>HTML biçiminde e-posta gövdesi</returns>
    public static string GetVerificationEmailTemplate(
        string username, 
        string title, 
        string code, 
        string description, 
        string expiryMinutes = "15")
    {
        var currentYear = DateTime.UtcNow.Year;

        return $@"<!DOCTYPE html>
<html lang=""tr"">
<head>
    <meta charset=""utf-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>{title}</title>
</head>
<body style=""margin: 0; padding: 0; background-color: #f4f7f6; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;"">
    <table border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""background-color: #f4f7f6; padding: 40px 0;"">
        <tr>
            <td align=""center"">
                <table border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);"">
                    <!-- Header Banner -->
                    <tr>
                        <td align=""center"" style=""background: linear-gradient(135deg, #2e7d32, #1b5e20); padding: 30px 20px; color: #ffffff;"">
                            <div style=""font-size: 28px; font-weight: bold; letter-spacing: 1px; display: inline-flex; align-items: center; justify-content: center;"">
                                <span style=""font-size: 32px; margin-right: 8px; vertical-align: middle;"">🌿</span>
                                <span style=""vertical-align: middle;"">Bitki Klinik</span>
                            </div>
                            <div style=""font-size: 14px; margin-top: 5px; opacity: 0.8; letter-spacing: 0.5px;"">
                                Dijital Bitki Sağlığı Danışmanı
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Main Body -->
                    <tr>
                        <td style=""padding: 40px 30px; color: #333333;"">
                            <h2 style=""margin-top: 0; font-size: 20px; color: #1b5e20; font-weight: 600; line-height: 1.4;"">Merhaba {username},</h2>
                            <p style=""font-size: 16px; line-height: 1.6; color: #555555; margin-bottom: 25px;"">
                                {description}
                            </p>
                            
                            <!-- Verification Code Card -->
                            <div style=""background-color: #e8f5e9; border: 1px dashed #81c784; border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0;"">
                                <div style=""font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; color: #2e7d32; margin-bottom: 10px;"">
                                    Doğrulama Kodunuz
                                </div>
                                <div style=""font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1b5e20; font-family: 'Courier New', Courier, monospace; margin-bottom: 10px;"">
                                    {code}
                                </div>
                                <div style=""font-size: 13px; color: #558b2f;"">
                                    Bu kod <strong>{expiryMinutes} dakika</strong> boyunca geçerlidir.
                                </div>
                            </div>
                            
                            <p style=""font-size: 14px; line-height: 1.5; color: #888888; margin-top: 25px;"">
                                Eğer bu işlemi siz gerçekleştirmediyseniz, lütfen bu e-postayı dikkate almayınız. Güvenliğiniz için bu kodu kimseyle paylaşmayınız.
                            </p>
                            
                            <!-- Sign off -->
                            <div style=""margin-top: 40px; border-top: 1px solid #eeeeee; padding-top: 20px;"">
                                <p style=""font-size: 15px; color: #333333; margin: 0; font-weight: 600;"">Sağlıklı Günler Dileriz,</p>
                                <p style=""font-size: 14px; color: #666666; margin: 5px 0 0 0;"">Bitki Klinik Ekibi</p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align=""center"" style=""background-color: #fafafa; padding: 25px 20px; font-size: 12px; color: #999999; border-top: 1px solid #f0f0f0;"">
                            <p style=""margin: 0 0 8px 0;"">Bu e-posta otomatik olarak gönderilmiştir. Lütfen doğrudan yanıtlamayınız.</p>
                            <p style=""margin: 0;"">&copy; {currentYear} Bitki Klinik. Tüm hakları saklıdır.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>";
    }
}
