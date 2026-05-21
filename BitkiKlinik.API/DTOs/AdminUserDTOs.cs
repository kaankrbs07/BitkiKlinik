using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.DTOs;

/// <summary>
/// Admin panelinde kullanıcı listesi görüntülemek için kullanılır.
/// Şifre gibi hassas bilgileri içermez.
/// </summary>
public class UserResponseDTO
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public bool IsActive { get; set; }
    public bool IsVerified { get; set; }
    public string Role { get; set; } = string.Empty;
}

/// <summary>
/// Admin tarafından yeni kullanıcı oluşturmak için kullanılır.
/// </summary>
public class AdminCreateUserDTO
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = "User";
}

/// <summary>
/// Admin tarafından mevcut kullanıcıyı güncellemek için kullanılır.
/// Sadece gönderilen alanlar güncellenir (null olanlar atlanır).
/// </summary>
public class AdminUpdateUserDTO
{
    public string? Username { get; set; }
    public string? Email { get; set; }
    public string? Password { get; set; }
    public bool? IsActive { get; set; }
    public bool? IsVerified { get; set; }
    public string? Role { get; set; }
}
