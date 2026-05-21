using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Profil iş mantığını soyutlayan arayüz.
/// Dosya depolama ve veritabanı güncelleme operasyonlarını orkestre eder.
/// Controller bu arayüze bağımlıdır — asla doğrudan DbContext'e erişmez.
/// </summary>
public interface IProfileService
{
    /// <summary>
    /// Mevcut oturumdaki kullanıcının profil bilgilerini döndürür.
    /// </summary>
    Task<ProfileResponseDTO?> GetProfileAsync(int userId);

    /// <summary>
    /// Kullanıcının profil bilgilerini ve/veya profil fotoğrafını günceller.
    /// Eski profil fotoğrafı varsa diskten silinir.
    /// </summary>
    /// <param name="userId">JWT'den alınan kullanıcı ID'si</param>
    /// <param name="dto">Güncellenecek metin alanları (nullable = atla)</param>
    /// <param name="profileImage">Opsiyonel profil fotoğrafı dosyası</param>
    Task<ProfileResponseDTO> UpdateProfileAsync(int userId, UpdateProfileDTO dto, IFormFile? profileImage);

    /// <summary>
    /// Kullanıcının profil fotoğrafını diskten siler ve veritabanından kaldırır.
    /// </summary>
    Task<ProfileResponseDTO> RemoveProfilePictureAsync(int userId);
}
