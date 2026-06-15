using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Interfaces;
using BitkiKlinik.API.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Cryptography;

namespace BitkiKlinik.API.Controllers;

[Route("api/[controller]")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly ITokenService _tokenService;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IEmailService _emailService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IUserService userService,
        ITokenService tokenService,
        IPasswordHasher passwordHasher,
        IEmailService emailService,
        ILogger<AuthController> logger)
    {
        _userService    = userService;
        _tokenService   = tokenService;
        _passwordHasher = passwordHasher;
        _emailService   = emailService;
        _logger         = logger;
    }

    // ── POST /api/auth/register ────────────────────────────────────────────
    [HttpPost("register")]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> Register([FromBody] UserRegisterDTO registerDto)
    {
        try
        {
            var user = new Users
            {
                Username = registerDto.Username,
                Email    = registerDto.Email,
                Password = registerDto.Password  // Hashleme UserService.CreateUserAsync içinde yapılır.
            };

            var createdUser = await _userService.CreateUserAsync(user);

            // Güvenli 6 haneli OTP
            var verificationCode = GenerateOtp();
            createdUser.VerificationCode           = verificationCode;
            createdUser.VerificationCodeExpiryTime = DateTime.UtcNow.AddMinutes(15);

            // Token üret → refresh token kullanıcıya yazılır
            var tokenResponse = _tokenService.CreateToken(createdUser);

            // Token + OTP bilgileri tek sorguda kaydet
            await _userService.UpdateAsync(createdUser);

            var subject = "Bitki Klinik - E-posta Doğrulama Kodu";
            var description = "Bitki Klinik'e başarıyla kaydoldunuz! Kayıt işleminizi tamamlamak ve hesabınızı aktifleştirmek için lütfen aşağıdaki doğrulama kodunu kullanın.";
            var message = EmailTemplateHelper.GetVerificationEmailTemplate(createdUser.Username, subject, verificationCode, description);
            _emailService.SendEmailInBackground(createdUser.Email, subject, message);

            _logger.LogInformation("Yeni kullanıcı kaydı: {Username}", createdUser.Username);

            return Ok(new
            {
                Message      = "Kariyerinize ilk adımı attınız! Lütfen e-posta adresinize gönderilen doğrulama kodunu girerek hesabınızı aktifleştirin.",
                Token        = tokenResponse.AccessToken,
                RefreshToken = tokenResponse.RefreshToken
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Kayıt sırasında beklenmeyen hata. Username: {Username}", registerDto.Username);
            return StatusCode(500, new { Message = "Sunucu tarafında bir hata oluştu." });
        }
    }

    // ── POST /api/auth/login ───────────────────────────────────────────────
    [HttpPost("login")]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> Login([FromBody] UserLoginDTO loginDto)
    {
        // Hem kullanıcı adı hem e-posta ile giriş desteği
        var user = await _userService.GetByUsernameAsync(loginDto.Username)
                   ?? await _userService.GetByEmailAsync(loginDto.Username);

        if (user == null || !_passwordHasher.Verify(loginDto.Password, user.Password))
        {
            // Kullanıcı adı/şifre hataları bilinçli olarak aynı mesajla döner (enumeration önleme)
            _logger.LogWarning("Başarısız giriş denemesi. Girdi: {Input}", loginDto.Username);
            return Unauthorized(new { Message = "Geçersiz kullanıcı adı veya şifre." });
        }

        if (!user.IsActive)
        {
            _logger.LogWarning("Pasif hesaba giriş denemesi. UserId: {UserId}", user.Id);
            return Unauthorized(new { Message = "Hesabınız pasif duruma alınmış." });
        }

        if (!user.IsVerified)
        {
            _logger.LogInformation("Doğrulanmamış hesap girişi, yeni OTP gönderiliyor. UserId: {UserId}", user.Id);

            var verificationCode = GenerateOtp();
            user.VerificationCode           = verificationCode;
            user.VerificationCodeExpiryTime = DateTime.UtcNow.AddMinutes(15);

            var subject = "Bitki Klinik - Giriş E-posta Doğrulama Kodu";
            var description = "Hesabınız henüz doğrulanmamış görünüyor. Giriş yapabilmek ve hesabınızı aktifleştirmek için lütfen aşağıdaki doğrulama kodunu kullanın.";
            var message = EmailTemplateHelper.GetVerificationEmailTemplate(user.Username, subject, verificationCode, description);
            _emailService.SendEmailInBackground(user.Email, subject, message);
        }

        // Token üret → refresh token kullanıcıya yazılır
        var tokenResponse = _tokenService.CreateToken(user);
        await _userService.UpdateAsync(user);

        _logger.LogInformation("Başarılı giriş. UserId: {UserId}", user.Id);

        return Ok(new
        {
            Message      = "Giriş başarılı.",
            Token        = tokenResponse.AccessToken,
            RefreshToken = tokenResponse.RefreshToken
        });
    }

    // ── POST /api/auth/refresh ─────────────────────────────────────────────
    /// <summary>
    /// Geçerli bir refresh token ile yeni bir access + refresh token çifti döndürür.
    /// Eski refresh token geçersiz kılınır (token rotation).
    /// </summary>
    [HttpPost("refresh")]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequestDTO dto)
    {
        var user = await _userService.GetByRefreshTokenAsync(dto.RefreshToken);

        if (user == null)
        {
            _logger.LogWarning("Geçersiz veya süresi dolmuş refresh token denemesi.");
            return Unauthorized(new { Message = "Refresh token geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın." });
        }

        // Yeni token çifti üret → eski refresh token otomatik olarak değiştirilir (rotation)
        var tokenResponse = _tokenService.CreateToken(user);
        await _userService.UpdateAsync(user);

        _logger.LogInformation("Refresh token döndürüldü. UserId: {UserId}", user.Id);

        return Ok(new
        {
            Token        = tokenResponse.AccessToken,
            RefreshToken = tokenResponse.RefreshToken
        });
    }

    // ── POST /api/auth/verify-email ───────────────────────────────────────
    [HttpPost("verify-email")]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> VerifyEmail([FromBody] UserVerifyEmailDTO verifyDto)
    {
        // Pasif kullanıcılar da doğrulama yapabilmeli → IsActive filtresi uygulanmaz
        var user = await _userService.GetByEmailForVerificationAsync(verifyDto.Email);

        if (user == null)
            return NotFound(new { Message = "Kullanıcı bulunamadı." });

        if (user.IsVerified)
            return BadRequest(new { Message = "Bu hesap zaten doğrulanmış." });

        if (user.VerificationCode != verifyDto.Code)
            return BadRequest(new { Message = "Geçersiz doğrulama kodu." });

        if (user.VerificationCodeExpiryTime < DateTime.UtcNow)
            return BadRequest(new { Message = "Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin." });

        user.IsVerified                = true;
        user.VerificationCode          = null;
        user.VerificationCodeExpiryTime = null;

        await _userService.UpdateAsync(user);

        _logger.LogInformation("E-posta doğrulandı. UserId: {UserId}", user.Id);

        return Ok(new { Message = "E-posta adresiniz başarıyla doğrulandı. Artık giriş yapabilirsiniz." });
    }

    // ── POST /api/auth/resend-code ────────────────────────────────────────
    [HttpPost("resend-code")]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> ResendVerificationCode([FromBody] ResendCodeDTO dto)
    {
        // Pasif kullanıcılar da yeni kod isteyebilmeli → IsActive filtresi uygulanmaz
        var user = await _userService.GetByEmailForVerificationAsync(dto.Email);

        if (user == null)
            return NotFound(new { Message = "Bu e-posta adresine ait kayıtlı bir kullanıcı bulunamadı." });

        if (user.IsVerified)
            return BadRequest(new { Message = "Bu hesap zaten doğrulanmış." });

        var verificationCode = GenerateOtp();
        user.VerificationCode           = verificationCode;
        user.VerificationCodeExpiryTime = DateTime.UtcNow.AddMinutes(15);

        await _userService.UpdateAsync(user);

        var subject = "Bitki Klinik - Yeni E-posta Doğrulama Kodu";
        var description = "Talebiniz üzerine yeni bir doğrulama kodu üretilmiştir. Hesabınızı aktifleştirmek için lütfen aşağıdaki güncel doğrulama kodunu kullanın.";
        var message = EmailTemplateHelper.GetVerificationEmailTemplate(user.Username, subject, verificationCode, description);
        _emailService.SendEmailInBackground(user.Email, subject, message);

        _logger.LogInformation("Doğrulama kodu yeniden gönderildi. UserId: {UserId}", user.Id);

        return Ok(new { Message = "Yeni doğrulama kodu e-posta adresinize gönderildi." });
    }

    // ── POST /api/auth/forgot-password ────────────────────────────────────
    [HttpPost("forgot-password")]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordDTO dto)
    {
        var user = await _userService.GetByEmailAsync(dto.Email);
        
        if (user == null)
        {
            // Güvenlik amacıyla e-posta bulunamazsa bile "gönderildi" mesajı döneriz (user enumeration önleme)
            return Ok(new { Message = "Şifre sıfırlama kodu e-posta adresinize gönderildi (Eğer kayıtlıysa)." });
        }

        var resetCode = GenerateOtp();
        user.VerificationCode = resetCode;
        user.VerificationCodeExpiryTime = DateTime.UtcNow.AddMinutes(15);
        
        await _userService.UpdateAsync(user);

        var subject = "Bitki Klinik - Şifre Sıfırlama Kodu";
        var description = "Hesabınız için şifre sıfırlama talebinde bulundunuz. Şifrenizi güvenli bir şekilde yenilemek için lütfen aşağıdaki doğrulama kodunu kullanın.";
        var message = EmailTemplateHelper.GetVerificationEmailTemplate(user.Username, subject, resetCode, description);
        
        // Hangfire ile arka planda e-posta gönderimi
        _emailService.SendEmailInBackground(user.Email, subject, message);

        _logger.LogInformation("Şifre sıfırlama kodu gönderildi. UserId: {UserId}", user.Id);

        return Ok(new { Message = "Şifre sıfırlama kodu e-posta adresinize gönderildi." });
    }

    // ── POST /api/auth/reset-password ─────────────────────────────────────
    [HttpPost("reset-password")]
    [EnableRateLimiting("AuthPolicy")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDTO dto)
    {
        var user = await _userService.GetByEmailAsync(dto.Email);
        
        if (user == null)
            return NotFound(new { Message = "Kullanıcı bulunamadı." });

        if (user.VerificationCode != dto.Code)
            return BadRequest(new { Message = "Geçersiz şifre sıfırlama kodu." });

        if (user.VerificationCodeExpiryTime < DateTime.UtcNow)
            return BadRequest(new { Message = "Sıfırlama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin." });

        // Yeni şifre eski şifreyle aynı olmamalı
        if (_passwordHasher.Verify(dto.NewPassword, user.Password))
            return BadRequest(new { Message = "Yeni şifreniz mevcut şifrenizle aynı olamaz. Lütfen farklı bir şifre belirleyin." });

        // Şifreyi hashleyerek güncelle
        user.Password = _passwordHasher.Hash(dto.NewPassword);
        user.VerificationCode = null;
        user.VerificationCodeExpiryTime = null;

        // Opsiyonel: Aktif oturumları düşürmek için refresh token'ı sıfırla
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;

        await _userService.UpdateAsync(user);

        _logger.LogInformation("Şifre başarıyla yenilendi. UserId: {UserId}", user.Id);

        return Ok(new { Message = "Şifreniz başarıyla yenilendi. Yeni şifrenizle giriş yapabilirsiniz." });
    }

    // ── Private Helpers ────────────────────────────────────────────────────

    /// <summary>
    /// Kriptografik olarak güvenli 6 haneli OTP üretir.
    /// System.Random yerine RandomNumberGenerator kullanır.
    /// </summary>
    private static string GenerateOtp()
    {
        // 0-999999 aralığında uniform dağılım, ardından sıfır dolgulu 6 haneye formatla
        var bytes = new byte[4];
        RandomNumberGenerator.Fill(bytes);
        var value = (BitConverter.ToUInt32(bytes) % 900_000) + 100_000; // 100000-999999
        return value.ToString();
    }
}

