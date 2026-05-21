using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Services.Interfaces;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// Profil iş mantığını yürütür:
///   1. Dosya depolamayı IFileStorageService'e delege eder
///   2. Veritabanı işlemlerini IUserService üzerinden yapar
///   3. Eski profil fotoğrafının temizlenmesini koordine eder
///
/// Controller ile veritabanı/dosya sistemi arasındaki tek köprüdür.
/// </summary>
public class ProfileService : IProfileService
{
    private const string ProfileSubDirectory = "profiles";

    private readonly IUserService _userService;
    private readonly IFileStorageService _fileStorageService;
    private readonly ILogger<ProfileService> _logger;

    public ProfileService(
        IUserService userService,
        IFileStorageService fileStorageService,
        ILogger<ProfileService> logger)
    {
        _userService        = userService;
        _fileStorageService = fileStorageService;
        _logger             = logger;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  GetProfileAsync — Kullanıcı profilini getir
    // ──────────────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<ProfileResponseDTO?> GetProfileAsync(int userId)
    {
        var user = await _userService.GetByIdAsync(userId);

        if (user == null || !user.IsActive)
            return null;

        return MapToResponse(user);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  UpdateProfileAsync — Metin + görsel güncelleme orkestasyonu
    // ──────────────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<ProfileResponseDTO> UpdateProfileAsync(
        int userId, UpdateProfileDTO dto, IFormFile? profileImage)
    {
        // 1. Mevcut kullanıcıyı getir
        var user = await _userService.GetByIdAsync(userId)
            ?? throw new KeyNotFoundException("Kullanıcı bulunamadı.");

        if (!user.IsActive)
            throw new InvalidOperationException("Pasif durumdaki bir hesabın profili güncellenemez.");

        // ── 2. Metin alanlarını güncelle (sadece gönderilen alanlar) ─────
        if (!string.IsNullOrWhiteSpace(dto.Username) && dto.Username != user.Username)
        {
            var existing = await _userService.GetByUsernameAsync(dto.Username);
            if (existing != null)
                throw new ArgumentException("Bu kullanıcı adı zaten kullanımda.");

            user.Username = dto.Username;
        }

        if (!string.IsNullOrWhiteSpace(dto.Email) && dto.Email != user.Email)
        {
            var existing = await _userService.GetByEmailAsync(dto.Email);
            if (existing != null)
                throw new ArgumentException("Bu e-posta adresi zaten kullanımda.");

            user.Email = dto.Email;
        }

        // ── 3. Profil fotoğrafını güncelle ──────────────────────────────
        if (profileImage != null && profileImage.Length > 0)
        {
            // 3a. Eski fotoğrafı diskten sil (yer tasarrufu)
            if (!string.IsNullOrWhiteSpace(user.ProfilePictureUrl))
            {
                _fileStorageService.DeleteFile(user.ProfilePictureUrl);
                _logger.LogInformation(
                    "Kullanıcı {UserId} için eski profil fotoğrafı silindi: {OldUrl}",
                    userId, user.ProfilePictureUrl);
            }

            // 3b. Yeni fotoğrafı kaydet (validasyon + GUID isimlendirme service içinde)
            var newUrl = await _fileStorageService.SaveFileAsync(profileImage, ProfileSubDirectory);
            user.ProfilePictureUrl = newUrl;

            _logger.LogInformation(
                "Kullanıcı {UserId} için yeni profil fotoğrafı kaydedildi: {NewUrl}",
                userId, newUrl);
        }

        // ── 4. Veritabanını güncelle ────────────────────────────────────
        await _userService.UpdateAsync(user);

        return MapToResponse(user);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  RemoveProfilePictureAsync — Profil fotoğrafını kaldır
    // ──────────────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<ProfileResponseDTO> RemoveProfilePictureAsync(int userId)
    {
        var user = await _userService.GetByIdAsync(userId)
            ?? throw new KeyNotFoundException("Kullanıcı bulunamadı.");

        if (string.IsNullOrWhiteSpace(user.ProfilePictureUrl))
            return MapToResponse(user); // Zaten fotoğraf yok, erken dön

        // Eski dosyayı diskten sil
        _fileStorageService.DeleteFile(user.ProfilePictureUrl);
        _logger.LogInformation(
            "Kullanıcı {UserId} profil fotoğrafı kaldırıldı: {Url}",
            userId, user.ProfilePictureUrl);

        // Veritabanından URL'i temizle
        user.ProfilePictureUrl = null;
        await _userService.UpdateAsync(user);

        return MapToResponse(user);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Private Helper — Entity → DTO dönüşümü
    // ──────────────────────────────────────────────────────────────────────

    private static ProfileResponseDTO MapToResponse(Models.Users user)
    {
        return new ProfileResponseDTO
        {
            Id                = user.Id,
            Username          = user.Username,
            Email             = user.Email,
            ProfilePictureUrl = user.ProfilePictureUrl,
            CreatedAt         = user.CreatedAt,
            Role              = user.Role.ToString()
        };
    }
}
