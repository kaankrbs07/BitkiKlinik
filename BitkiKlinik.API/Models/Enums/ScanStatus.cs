namespace BitkiKlinik.API.Models.Enums;

/// <summary>
/// Tarama sonucunun genel sağlık durumunu belirtir.
/// Healthy = bitki sağlıklı, Risky = hastalık tespit edildi.
/// </summary>
public enum ScanStatus
{
    Healthy = 0,
    Risky   = 1
}
