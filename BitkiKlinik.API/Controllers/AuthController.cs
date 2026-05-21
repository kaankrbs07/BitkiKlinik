using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

[Route("api/[controller]")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly ITokenService _tokenService;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IEmailService _emailService;

    public AuthController(
        IUserService userService,
        ITokenService tokenService,
        IPasswordHasher passwordHasher,
        IEmailService emailService)
    {
        _userService    = userService;
        _tokenService   = tokenService;
        _passwordHasher = passwordHasher;
        _emailService   = emailService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] UserRegisterDTO registerDto)
    {
        try
        {
            var user = new Users
            {
                Username = registerDto.Username,
                Email = registerDto.Email,
                Password = registerDto.Password // Hashleme UserService.CreateUserAsync içinde yapılır.
            };

            var createdUser = await _userService.CreateUserAsync(user);

            // Rastgele 6 haneli doğrulama kodu oluştur
            var random = new Random();
            var verificationCode = random.Next(100000, 999999).ToString();
            
            createdUser.VerificationCode = verificationCode;
            createdUser.VerificationCodeExpiryTime = DateTime.UtcNow.AddMinutes(15);
            
            await _userService.UpdateAsync(createdUser);

            // Doğrulama e-postasını arka planda gönder (Axios timeout'u önlemek için)
            var subject = "Bitki Klinik - E-posta Doğrulama Kodu";
            var message = $"Merhaba {createdUser.Username},<br><br>Kayıt işleminizi tamamlamak için doğrulama kodunuz: <b>{verificationCode}</b><br><br>Bu kod 15 dakika boyunca geçerlidir.";
            
            _emailService.SendEmailInBackground(createdUser.Email, subject, message);

            return Ok(new 
            { 
                Message = "Kariyerinize ilk adımı attınız! Lütfen e-posta adresinize gönderilen doğrulama kodunu girerek hesabınızı aktifleştirin."
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            // Geliştirme sürecinde hatayı net görmek için mesajı dönüyoruz
            return StatusCode(500, new { message = "Sunucu tarafında bir hata oluştu: " + ex.Message });
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] UserLoginDTO loginDto)
    {
        // Hem kullanıcı adı hem de e-posta ile girişi destekle
        var user = await _userService.GetByUsernameAsync(loginDto.Username) 
                   ?? await _userService.GetByEmailAsync(loginDto.Username);

        if (user == null)
        {
            Console.WriteLine($"[Login] Kullanıcı bulunamadı: {loginDto.Username}");
            return Unauthorized(new { Message = "Geçersiz kullanıcı adı veya şifre." });
        }

        // BCrypt ile hash karşılaştırması
        if (!_passwordHasher.Verify(loginDto.Password, user.Password))
        {
            Console.WriteLine($"[Login] Şifre hatalı: {loginDto.Username}");
            return Unauthorized(new { Message = "Geçersiz kullanıcı adı veya şifre." });
        }

        if (!user.IsActive)
        {
            Console.WriteLine($"[Login] Hesap pasif: {loginDto.Username}");
            return Unauthorized(new { Message = "Hesabınız pasif duruma alınmış." });
        }

        if (!user.IsVerified)
        {
            Console.WriteLine($"[Login] Hesap doğrulanmamış: {loginDto.Username}");
            return Unauthorized(new { Message = "Lütfen önce e-posta adresinizi doğrulayın." });
        }

        var tokenResponse = _tokenService.CreateToken(user);
        
        Console.WriteLine($"[Login] Başarılı giriş: {loginDto.Username}");

        return Ok(new 
        { 
            Message = "Giriş başarılı.", 
            Token = tokenResponse.AccessToken,
            RefreshToken = tokenResponse.RefreshToken
        });
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromBody] UserVerifyEmailDTO verifyDto)
    {
        var user = await _userService.GetByEmailAsync(verifyDto.Email);

        if (user == null)
            return NotFound(new { Message = "Kullanıcı bulunamadı." });

        if (user.IsVerified)
            return BadRequest(new { Message = "Bu hesap zaten doğrulanmış." });

        // Kod ve Süre Kontrolü
        if (user.VerificationCode != verifyDto.Code)
            return BadRequest(new { Message = "Geçersiz doğrulama kodu." });

        if (user.VerificationCodeExpiryTime < DateTime.UtcNow)
            return BadRequest(new { Message = "Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin." });

        // Doğrulama başarılı
        user.IsVerified = true;
        user.VerificationCode = null;
        user.VerificationCodeExpiryTime = null;

        await _userService.UpdateAsync(user);

        return Ok(new { Message = "E-posta adresiniz başarıyla doğrulandı. Artık giriş yapabilirsiniz." });
    }
}
