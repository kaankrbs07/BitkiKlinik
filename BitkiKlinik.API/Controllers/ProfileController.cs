using System.Security.Claims;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

/// <summary>
/// Oturum açmış kullanıcının kendi profilini görüntülemesine
/// ve güncellemesine (metin + fotoğraf) olanak tanır.
///
/// ┌─────────────────────────────────────────────────────────────┐
/// │  İstek Akışı (Separation of Concerns)                      │
/// │                                                             │
/// │  Client ──► ProfileController (HTTP katmanı)                │
/// │                  │                                          │
/// │                  ├──► IProfileService (iş mantığı)          │
/// │                  │        │                                  │
/// │                  │        ├──► IFileStorageService (dosya)   │
/// │                  │        └──► IUserService (veritabanı)    │
/// │                  │                                          │
/// │             ◄── HTTP Response                               │
/// └─────────────────────────────────────────────────────────────┘
/// </summary>
[Route("api/[controller]")]
[ApiController]
[Authorize]
public class ProfileController : ControllerBase
{
    private readonly IProfileService _profileService;

    public ProfileController(IProfileService profileService)
    {
        _profileService = profileService;
    }

    // ────────────────────────────────────────────────────────────────
    //  GET  /api/profile          → Mevcut kullanıcının profilini getir
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// JWT'deki kullanıcı ID'sine göre profil bilgilerini döndürür.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetMyProfile()
    {
        var userId = GetCurrentUserId();

        var profile = await _profileService.GetProfileAsync(userId);

        if (profile == null)
            return NotFound(new { Message = "Profil bulunamadı." });

        return Ok(profile);
    }

    // ────────────────────────────────────────────────────────────────
    //  PUT  /api/profile          → Profili güncelle (metin + fotoğraf)
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Kullanıcının profil bilgilerini ve/veya profil fotoğrafını günceller.
    ///
    /// Content-Type: multipart/form-data
    ///   - Username   (string, opsiyonel)
    ///   - Email      (string, opsiyonel)
    ///   - ProfileImage  (file,   opsiyonel — .jpg, .jpeg, .png, .webp)
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> UpdateMyProfile(
        [FromForm] UpdateProfileDTO dto,
        IFormFile? profileImage)
    {
        try
        {
            var userId = GetCurrentUserId();

            var updatedProfile = await _profileService.UpdateProfileAsync(userId, dto, profileImage);

            return Ok(new
            {
                Message = "Profil başarıyla güncellendi.",
                Profile = updatedProfile
            });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                Message = "Profil güncellenirken bir hata oluştu.",
                Error   = ex.Message
            });
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  DELETE  /api/profile/picture  → Profil fotoğrafını kaldır
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Kullanıcının profil fotoğrafını siler (metin bilgileri korunur).
    /// </summary>
    [HttpDelete("picture")]
    public async Task<IActionResult> RemoveProfilePicture()
    {
        try
        {
            var userId = GetCurrentUserId();

            var updatedProfile = await _profileService.RemoveProfilePictureAsync(userId);

            return Ok(new
            {
                Message = "Profil fotoğrafı kaldırıldı.",
                Profile = updatedProfile
            });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                Message = "Profil fotoğrafı kaldırılırken bir hata oluştu.",
                Error   = ex.Message
            });
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  Private Helper — JWT'den kullanıcı ID'sini çıkar
    // ────────────────────────────────────────────────────────────────

    private int GetCurrentUserId()
    {
        // TokenService'de claim olarak JwtRegisteredClaimNames.NameId kullanılıyor
        var nameIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(nameIdClaim) || !int.TryParse(nameIdClaim, out var userId))
            throw new UnauthorizedAccessException("Geçersiz veya eksik kullanıcı kimliği.");

        return userId;
    }
}
