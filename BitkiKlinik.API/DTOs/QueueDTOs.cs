namespace BitkiKlinik.API.DTOs;

/// <summary>
/// RabbitMQ Management API'den çekilen kuyruk metriklerini mobil istemciye iletmek için kullanılan DTO.
/// </summary>
public class RabbitMqMetricsDTO
{
    public string QueueName { get; set; } = string.Empty;
    public int PendingJobs { get; set; }          // Kuyrukta bekleyen iş sayısı (messages_ready)
    public int ActiveJobs { get; set; }           // Şu an işlenmekte olan iş sayısı (messages_unacknowledged)
    public int ActiveWorkers { get; set; }        // Bağlı olan aktif worker sayısı (consumers)
    public string Status { get; set; } = "unknown"; // Kuyruk durumu (örn: running, idle)
    public double PublishRate { get; set; }       // Saniyede yayınlanan mesaj hızı
    public double DeliverRate { get; set; }       // Saniyede işlenen/teslim edilen mesaj hızı
    public bool IsHealthy { get; set; }           // RabbitMQ servisinin genel sağlık durumu
}
