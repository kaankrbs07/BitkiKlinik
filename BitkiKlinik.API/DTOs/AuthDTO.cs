namespace BitkiKlinik.API.DTOs;

public class AuthDTO
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
}
