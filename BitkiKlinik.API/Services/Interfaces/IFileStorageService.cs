namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Dosya depolama işlemlerini soyutlayan arayüz.
/// Yerel disk, Azure Blob, AWS S3 gibi farklı implementasyonlarla
/// değiştirilebilir — controller ve iş servisleri bu arayüze bağımlıdır.
/// </summary>
public interface IFileStorageService
{
    /// <summary>
    /// Dosyayı doğrular (boyut, uzantı), diske kaydeder ve erişim URL'ini döndürür.
    /// </summary>
    /// <param name="file">Yüklenen dosya</param>
    /// <param name="subDirectory">Hedef alt dizin (ör: "profiles", "scans")</param>
    /// <returns>Dosyanın göreli erişim URL'i (ör: /uploads/profiles/abc-123.jpg)</returns>
    Task<string> SaveFileAsync(IFormFile file, string subDirectory);

    /// <summary>
    /// Belirtilen göreli URL'deki dosyayı diskten siler.
    /// Dosya bulunamazsa sessizce geçer (idempotent).
    /// </summary>
    /// <param name="relativeUrl">Silinecek dosyanın göreli URL'i</param>
    void DeleteFile(string relativeUrl);

    /// <summary>
    /// Dosyanın uzantı ve boyut kurallarına uygunluğunu doğrular.
    /// Uygun değilse ArgumentException fırlatır.
    /// </summary>
    /// <param name="file">Doğrulanacak dosya</param>
    void ValidateFile(IFormFile file);
}
