namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Şifre hashleme ve doğrulama işlemlerini soyutlar.
/// Gelecekte BCrypt'ten farklı bir algoritmaya geçmek istersen
/// sadece bu arayüzün implementasyonunu değiştirmek yeterlidir.
/// </summary>
public interface IPasswordHasher
{
    /// <summary>
    /// Düz metin şifreyi hashler ve hash'i döndürür.
    /// </summary>
    string Hash(string plainPassword);

    /// <summary>
    /// Düz metin şifreyi mevcut hash ile karşılaştırır.
    /// </summary>
    bool Verify(string plainPassword, string hashedPassword);
}
