using BitkiKlinik.API.Services.Interfaces;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// BCrypt.Net-Next kütüphanesini kullanarak şifre hashleme ve doğrulama yapar.
/// Work factor (11) brute-force saldırılarına karşı iyi bir denge sağlar.
/// Her hash içinde otomatik olarak benzersiz bir salt gömülüdür.
/// </summary>
public class BcryptPasswordHasher : IPasswordHasher
{
    // Work factor: 2^11 = 2048 iterasyon. 10-12 arası production için önerilir.
    private const int WorkFactor = 11;

    public string Hash(string plainPassword)
    {
        return BCrypt.Net.BCrypt.HashPassword(plainPassword, WorkFactor);
    }

    public bool Verify(string plainPassword, string hashedPassword)
    {
        return BCrypt.Net.BCrypt.Verify(plainPassword, hashedPassword);
    }
}
