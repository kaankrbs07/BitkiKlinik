using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

/// <summary>
/// Admin kullanıcılarının tüm kullanıcıları yönetmesine olanak tanıyan CRUD controller.
/// Tüm endpoint'ler [Authorize(Roles = "Admin")] ile korunmaktadır.
/// </summary>
[Route("api/[controller]")]
[ApiController]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly IPasswordHasher _passwordHasher;

    public UsersController(IUserService userService, IPasswordHasher passwordHasher)
    {
        _userService    = userService;
        _passwordHasher = passwordHasher;
    }

    // ────────────────────────────────────────────────────────────────
    //  GET  /api/users              → Tüm kullanıcıları listele
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Tüm aktif ve pasif kullanıcıları listeler (admin görünümü).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAllUsers()
    {
        // Admin tüm kullanıcıları görmeli (pasif olanlar dahil)
        var users = await _userService.FindAsync(_ => true);

        var result = users.Select(MapToResponseDTO);

        return Ok(result);
    }

    // ────────────────────────────────────────────────────────────────
    //  GET  /api/users/{id}         → Tek bir kullanıcıyı getir
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Belirtilen ID'ye sahip kullanıcıyı getirir.
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetUserById(int id)
    {
        var user = await _userService.GetByIdAsync(id);

        if (user == null)
            return NotFound(new { Message = "Kullanıcı bulunamadı." });

        return Ok(MapToResponseDTO(user));
    }

    // ────────────────────────────────────────────────────────────────
    //  POST /api/users              → Yeni kullanıcı oluştur
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Admin panelinden yeni kullanıcı oluşturur.
    /// E-posta doğrulama adımı atlanır (admin doğrudan doğrulanmış oluşturabilir).
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateUser([FromBody] AdminCreateUserDTO dto)
    {
        try
        {
            // Rol dönüştürme
            if (!Enum.TryParse<UserRole>(dto.Role, ignoreCase: true, out var role))
                return BadRequest(new { Message = $"Geçersiz rol: '{dto.Role}'. Geçerli değerler: User, Admin." });

            var user = new Users
            {
                Username   = dto.Username,
                Email      = dto.Email,
                Password   = dto.Password,
                Role       = role,
                IsVerified = true // Admin tarafından oluşturulan hesap doğrulanmış sayılır
            };

            var createdUser = await _userService.CreateUserAsync(user);

            return CreatedAtAction(
                nameof(GetUserById),
                new { id = createdUser.Id },
                MapToResponseDTO(createdUser));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { Message = "Kullanıcı oluşturulurken bir hata oluştu.", Error = ex.Message });
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  PUT  /api/users/{id}         → Kullanıcıyı güncelle
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Belirtilen kullanıcının bilgilerini günceller.
    /// Sadece DTO'da gönderilen (null olmayan) alanlar güncellenir.
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] AdminUpdateUserDTO dto)
    {
        try
        {
            var user = await _userService.GetByIdAsync(id);

            if (user == null)
                return NotFound(new { Message = "Kullanıcı bulunamadı." });

            // ── Benzersizlik kontrolleri ──────────────────────────────────
            if (!string.IsNullOrWhiteSpace(dto.Username) && dto.Username != user.Username)
            {
                var existing = await _userService.GetByUsernameAsync(dto.Username);
                if (existing != null)
                    return Conflict(new { Message = "Bu kullanıcı adı zaten kullanımda." });

                user.Username = dto.Username;
            }

            if (!string.IsNullOrWhiteSpace(dto.Email) && dto.Email != user.Email)
            {
                var existing = await _userService.GetByEmailAsync(dto.Email);
                if (existing != null)
                    return Conflict(new { Message = "Bu e-posta adresi zaten kullanımda." });

                user.Email = dto.Email;
            }

            // ── Şifre güncelleme ─────────────────────────────────────────
            if (!string.IsNullOrWhiteSpace(dto.Password))
            {
                user.Password = _passwordHasher.Hash(dto.Password);
            }

            // ── Boolean alanlar ──────────────────────────────────────────
            if (dto.IsActive.HasValue)
                user.IsActive = dto.IsActive.Value;

            if (dto.IsVerified.HasValue)
                user.IsVerified = dto.IsVerified.Value;

            // ── Rol güncelleme ───────────────────────────────────────────
            if (!string.IsNullOrWhiteSpace(dto.Role))
            {
                if (!Enum.TryParse<UserRole>(dto.Role, ignoreCase: true, out var role))
                    return BadRequest(new { Message = $"Geçersiz rol: '{dto.Role}'. Geçerli değerler: User, Admin." });

                user.Role = role;
            }

            await _userService.UpdateAsync(user);

            return Ok(new
            {
                Message = "Kullanıcı başarıyla güncellendi.",
                User    = MapToResponseDTO(user)
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { Message = "Kullanıcı güncellenirken bir hata oluştu.", Error = ex.Message });
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  DELETE /api/users/{id}       → Kullanıcıyı sil (soft delete)
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Kullanıcıyı soft-delete ile pasif duruma alır.
    /// Veritabanından fiziksel olarak silinmez.
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var user = await _userService.GetByIdAsync(id);

        if (user == null)
            return NotFound(new { Message = "Kullanıcı bulunamadı." });

        // Admin'in kendisini silmesini engelle
        var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (currentUserId == id.ToString())
            return BadRequest(new { Message = "Kendi hesabınızı silemezsiniz." });

        await _userService.DeleteAsync(id);

        return Ok(new { Message = "Kullanıcı başarıyla pasif duruma alındı." });
    }

    // ────────────────────────────────────────────────────────────────
    //  PATCH /api/users/{id}/activate   → Pasif kullanıcıyı aktif et
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Pasif durumdaki bir kullanıcıyı tekrar aktif hale getirir.
    /// </summary>
    [HttpPatch("{id}/activate")]
    public async Task<IActionResult> ActivateUser(int id)
    {
        var user = await _userService.GetByIdAsync(id);

        if (user == null)
            return NotFound(new { Message = "Kullanıcı bulunamadı." });

        if (user.IsActive)
            return BadRequest(new { Message = "Bu kullanıcı zaten aktif durumda." });

        user.IsActive = true;
        await _userService.UpdateAsync(user);

        return Ok(new
        {
            Message = "Kullanıcı başarıyla aktif hale getirildi.",
            User    = MapToResponseDTO(user)
        });
    }

    // ────────────────────────────────────────────────────────────────
    //  Private Helpers
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Users entity'sini şifre bilgisi içermeyen UserResponseDTO'ya dönüştürür.
    /// </summary>
    private static UserResponseDTO MapToResponseDTO(Users user)
    {
        return new UserResponseDTO
        {
            Id         = user.Id,
            Username   = user.Username,
            Email      = user.Email,
            CreatedAt  = user.CreatedAt,
            IsActive   = user.IsActive,
            IsVerified = user.IsVerified,
            Role       = user.Role.ToString()
        };
    }
}
