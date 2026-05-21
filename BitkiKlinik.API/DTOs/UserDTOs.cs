namespace BitkiKlinik.API.DTOs;

public class UserRegisterDTO
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class UserLoginDTO
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class UserVerifyEmailDTO
{
    public string Email { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}
