namespace BitkiKlinik.API.DTOs;

/// <summary>
/// Profil güncelleme isteğinde kullanılacak DTO.
/// multipart/form-data ile gönderilir — metin alanları + dosya birlikte gelir.
/// Sadece gönderilen (null olmayan) alanlar güncellenir.
/// </summary>
public class UpdateProfileDTO
{
    public string? Username { get; set; }
    public string? Email { get; set; }
}

/// <summary>
/// Profil bilgilerini döndürmek için kullanılır.
/// Hassas veriler (şifre, doğrulama kodu vb.) asla bu DTO'da yer almaz.
/// </summary>
public class ProfileResponseDTO
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? ProfilePictureUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public string Role { get; set; } = string.Empty;
}
