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
    /// Belirtilen göreli URL'e göre tam veya geçici erişim URL'ini döndürür.
    /// Yerel depolamada doğrudan göreli URL dönerken,
    /// bulut depolamalarda (örn: Backblaze B2) geçici imzalı (pre-signed) URL döner.
    /// </summary>
    /// <param name="relativeUrl">Dosyanın göreli URL'i (ör: /uploads/profiles/abc.jpg veya profiles/abc.jpg)</param>
    /// <returns>İmzalı veya tam erişim URL'i</returns>
    string GetFileUrl(string? relativeUrl);

    /// <summary>
    /// Yerel depolamadaki (wwwroot/uploads) eski dosyaları otomatik olarak bulut depolamaya taşır (idempotent).
    /// </summary>
    /// <param name="webRootPath">Sunucunun web root dizin yolu (wwwroot)</param>
    Task MigrateLocalFilesAsync(string webRootPath);

    /// <summary>
    /// Belirtilen dosya yolundaki dosyanın var olup olmadığını kontrol eder.
    /// </summary>
    /// <param name="relativeUrl">Dosyanın göreli URL'i</param>
    /// <returns>Dosya mevcut ise true, aksi halde false</returns>
    Task<bool> FileExistsAsync(string? relativeUrl);

    /// <summary>
    /// Belirtilen dosya yolundaki dosyanın byte verilerini asenkron olarak okur.
    /// </summary>
    /// <param name="relativeUrl">Dosyanın göreli URL'i</param>
    /// <returns>Dosya byte'ları veya dosya bulunamazsa null</returns>
    Task<byte[]?> GetFileBytesAsync(string? relativeUrl);

    /// <summary>
    /// Byte dizisi halindeki dosya verisini depolama alanına kaydeder.
    /// </summary>
    /// <param name="fileBytes">Dosyanın byte verisi</param>
    /// <param name="fileName">Dosya adı (uzantısıyla birlikte)</param>
    /// <param name="subDirectory">Hedef alt dizin (ör: "profiles", "scans")</param>
    /// <param name="preserveFileName">Eğer true ise dosya adı GUID ile değiştirilmeden orijinal haliyle korunur.</param>
    /// <returns>Kaydedilen dosyanın göreli URL'i</returns>
    Task<string> SaveFileBytesAsync(byte[] fileBytes, string fileName, string subDirectory, bool preserveFileName = false);

    /// <summary>
    /// Dosyanın uzantı ve boyut kurallarına uygunluğunu doğrular.
    /// Uygun değilse ArgumentException fırlatır.
    /// </summary>
    /// <param name="file">Doğrulanacak dosya</param>
    void ValidateFile(IFormFile file);
}
