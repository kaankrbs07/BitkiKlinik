using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

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
    private readonly IConfiguration _configuration;

    public UsersController(IUserService userService, IPasswordHasher passwordHasher, IConfiguration configuration)
    {
        _userService    = userService;
        _passwordHasher = passwordHasher;
        _configuration  = configuration;
    }

    // ────────────────────────────────────────────────────────────────
    //  GET  /api/users?page=1&pageSize=20  → Sayfalı kullanıcı listesi
    // ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Tüm kullanıcıları sayfalı olarak listeler (admin görünümü).
    /// Büyüyen kullanıcı tabanında tüm tabloyu belleğe yüklemez.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAllUsers(
        [FromQuery] int page     = 1,
        [FromQuery] int pageSize = 20)
    {
        // Girdi sınırlama
        page     = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var allUsers = await _userService.FindAsync(_ => true);

        var totalCount = allUsers.Count();
        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        var paged = allUsers
            .OrderBy(u => u.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(MapToResponseDTO);

        // Sayfalama meta verisi header'a eklenir (body'yi şişirme)
        Response.Headers["X-Total-Count"] = totalCount.ToString();
        Response.Headers["X-Total-Pages"] = totalPages.ToString();
        Response.Headers["X-Current-Page"] = page.ToString();
        Response.Headers["Access-Control-Expose-Headers"] = "X-Total-Count, X-Total-Pages, X-Current-Page";

        return Ok(paged);
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

                // Super Admin Hesabı Koruma Mantığı
                var superAdminsStr = _configuration["SuperAdminEmails"] ?? string.Empty;
                var superAdmins = superAdminsStr.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(e => e.Trim());
                if (superAdmins.Contains(user.Email) && role != user.Role)
                {
                    return BadRequest(new { Message = "Sistem bütünlüğü için yapılandırmada Super Admin hesaplarının rolü değiştirilemez." });
                }

                // Kendi rolünü demote etmeyi (User yapmayı) engelle
                var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (currentUserId == id.ToString() && role == UserRole.User && user.Role == UserRole.Admin)
                {
                    return BadRequest(new { Message = "Kendi Admin rolünüzü standart kullanıcıya (User) düşüremezsiniz." });
                }

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

        // Super Admin hesaplarının silinmesini engelle
        var superAdminsStr = _configuration["SuperAdminEmails"] ?? string.Empty;
        var superAdmins = superAdminsStr.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(e => e.Trim());
        if (superAdmins.Contains(user.Email))
            return BadRequest(new { Message = "Sistem bütünlüğü için yapılandırmada (.env) tanımlı Super Admin hesapları silinemez/pasife alınamaz." });

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

    private UserResponseDTO MapToResponseDTO(Users user)
    {
        var superAdminsStr = _configuration["SuperAdminEmails"] ?? string.Empty;
        var superAdmins = superAdminsStr.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(e => e.Trim());
        bool isSuperAdmin = superAdmins.Contains(user.Email);

        return new UserResponseDTO
        {
            Id           = user.Id,
            Username     = user.Username,
            Email        = user.Email,
            CreatedAt    = DateTime.SpecifyKind(user.CreatedAt, DateTimeKind.Utc),
            IsActive     = user.IsActive,
            IsVerified   = user.IsVerified,
            Role         = user.Role.ToString(),
            IsSuperAdmin = isSuperAdmin
        };
    }
}
