using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.Models;

public class Users
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
    public string? VerificationCode { get; set; }
    public DateTime? VerificationCodeExpiryTime { get; set; }
    public bool IsVerified { get; set; } = false;
    public UserRole Role { get; set; } = UserRole.User;
    public string? ProfilePictureUrl { get; set; }

    // ── Refresh Token ─────────────────────────────────────────────
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }

    // ── Navigation properties ─────────────────────────────────────
    public ICollection<PlantScan> PlantScans { get; set; } = new List<PlantScan>();
}

