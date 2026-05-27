using BitkiKlinik.API.Models;

namespace BitkiKlinik.API.Services.Interfaces;

public interface IUserService : IGenericService<Users>
{
    Task<Users?> GetByUsernameAsync(string username);
    Task<Users?> GetByEmailAsync(string email);

    /// <summary>
    /// E-posta doğrulama akışlarında kullanılır (IsActive filtresi uygulanmaz).
    /// Pasif kullanıcılar da OTP gönderebilmeli ve doğrulayabilmelidir.
    /// </summary>
    Task<Users?> GetByEmailForVerificationAsync(string email);
    Task<Users> CreateUserAsync(Users user);

    /// <summary>
    /// Geçerli (süresi dolmamış) bir refresh token'a sahip kullanıcıyı döndürür.
    /// Token eşleşmesi olmadığında veya süresi geçtiğinde null döner.
    /// </summary>
    Task<Users?> GetByRefreshTokenAsync(string refreshToken);
}

