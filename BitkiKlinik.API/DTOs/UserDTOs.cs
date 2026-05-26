using System.ComponentModel.DataAnnotations;

namespace BitkiKlinik.API.DTOs;

public class UserRegisterDTO
{
    [Required(ErrorMessage = "Kullanıcı adı zorunludur.")]
    [StringLength(50, MinimumLength = 3, ErrorMessage = "Kullanıcı adı 3-50 karakter arasında olmalıdır.")]
    [RegularExpression(@"^[a-zA-Z0-9_]+$", ErrorMessage = "Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir.")]
    public string Username { get; set; } = string.Empty;

    [Required(ErrorMessage = "E-posta adresi zorunludur.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi giriniz.")]
    [StringLength(254, ErrorMessage = "E-posta adresi 254 karakterden uzun olamaz.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Şifre zorunludur.")]
    [StringLength(128, MinimumLength = 8, ErrorMessage = "Şifre en az 8 karakter olmalıdır.")]
    public string Password { get; set; } = string.Empty;
}

public class UserLoginDTO
{
    [Required(ErrorMessage = "Kullanıcı adı veya e-posta zorunludur.")]
    [StringLength(254)]
    public string Username { get; set; } = string.Empty;

    [Required(ErrorMessage = "Şifre zorunludur.")]
    [StringLength(128)]
    public string Password { get; set; } = string.Empty;
}

public class UserVerifyEmailDTO
{
    [Required(ErrorMessage = "E-posta adresi zorunludur.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi giriniz.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Doğrulama kodu zorunludur.")]
    [StringLength(6, MinimumLength = 6, ErrorMessage = "Doğrulama kodu 6 haneli olmalıdır.")]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "Doğrulama kodu yalnızca rakam içermelidir.")]
    public string Code { get; set; } = string.Empty;
}

public class ResendCodeDTO
{
    [Required(ErrorMessage = "E-posta adresi zorunludur.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi giriniz.")]
    public string Email { get; set; } = string.Empty;
}

/// <summary>
/// POST /auth/refresh — Geçerli bir refresh token ile yeni access + refresh token çifti üretir.
/// </summary>
public class RefreshTokenRequestDTO
{
    [Required(ErrorMessage = "Refresh token zorunludur.")]
    public string RefreshToken { get; set; } = string.Empty;
}
