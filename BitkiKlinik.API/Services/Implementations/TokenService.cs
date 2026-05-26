using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.IdentityModel.Tokens;

namespace BitkiKlinik.API.Services.Implementations;

public class TokenService : ITokenService
{
    private readonly IConfiguration _config;
    private readonly SymmetricSecurityKey _key;

    // Refresh token'ın geçerlilik süresi (gün).
    // Üretimde appsettings'ten okunabilir; şimdilik sabit 7 gün.
    private const int RefreshTokenExpiryDays = 7;

    public TokenService(IConfiguration config)
    {
        _config = config;
        _key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
    }

    /// <summary>
    /// Yeni bir access token + refresh token çifti üretir.
    /// Refresh token kullanıcı nesnesine yazılır; çağıran kod kullanıcıyı
    /// veritabanına kaydetmelidir (SaveChangesAsync).
    /// </summary>
    public AuthDTO CreateToken(Users user)
    {
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.NameId, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim("isVerified", user.IsVerified.ToString().ToLower())
        };

        var creds = new SigningCredentials(_key, SecurityAlgorithms.HmacSha512Signature);

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(double.Parse(_config["Jwt:ExpireMinutes"]!)),
            SigningCredentials = creds,
            Issuer = _config["Jwt:Issuer"],
            Audience = _config["Jwt:Audience"]
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);

        // Yeni refresh token üret ve kullanıcı nesnesine yaz
        var refreshToken = GenerateRefreshToken();
        user.RefreshToken       = refreshToken;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(RefreshTokenExpiryDays);

        return new AuthDTO
        {
            AccessToken  = tokenHandler.WriteToken(token),
            RefreshToken = refreshToken
        };
    }

    private static string GenerateRefreshToken()
    {
        var randomNumber = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);
        return Convert.ToBase64String(randomNumber);
    }
}

