namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Model yeniden eğitim isteklerini bir mesaj kuyruğuna (RabbitMQ) yayınlar.
/// Bu arayüzü kullanmak, çıkarım (inference) ve eğitim (training) süreçlerini
/// birbirinden fiziksel olarak ayırır; Python FastAPI sunucusu bloklanmaz.
/// </summary>
public interface IRetrainQueueService
{
    /// <summary>
    /// Yeniden eğitim işini kuyruğa ekler.
    /// </summary>
    /// <param name="triggeredBy">İşlemi tetikleyen admin kullanıcısının adı (loglama için).</param>
    /// <returns>Kuyruk mesajı başarıyla yayınlandıysa true.</returns>
    Task<bool> PublishRetrainJobAsync(string? triggeredBy = null);

    /// <summary>
    /// Kuyruk servisinin sağlık durumunu döndürür.
    /// </summary>
    Task<bool> IsHealthyAsync();
}
