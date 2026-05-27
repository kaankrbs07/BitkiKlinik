using System.Text;
using System.Text.Json;
using BitkiKlinik.API.Services.Interfaces;
using RabbitMQ.Client;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// RabbitMQ kullanarak model yeniden eğitim işlerini kuyruğa ekler.
///
/// Mimari:  [C# API] → [RabbitMQ: bitkiklinik.retrain queue] → [Python retrain_worker.py]
///
/// Bu sayede:
/// - FastAPI inference sunucusu eğitim yükünden tamamen korunur.
/// - Python worker yeniden eğitimi kendi sürecinde ve kendi donanımında çalıştırır.
/// - Ağ kesintilerinde mesaj RabbitMQ'da bekler; düştükten sonra otomatik yeniden işlenir.
/// - RabbitMQ.Client v7 (async) → IChannel, IConnection kullanılır.
/// </summary>
public sealed class RabbitMqRetrainQueueService : IRetrainQueueService, IAsyncDisposable
{
    // ── Sabitler ──────────────────────────────────────────────────────────────
    private const string QueueName    = "bitkiklinik.retrain";
    private const string ExchangeName = "";          // Default exchange (direct)

    // ── Bağımlılıklar ─────────────────────────────────────────────────────────
    private readonly ILogger<RabbitMqRetrainQueueService> _logger;
    private readonly string _connectionString;

    // ── Durum ─────────────────────────────────────────────────────────────────
    private IConnection? _connection;
    private IChannel?    _channel;
    private readonly SemaphoreSlim _connectLock = new(1, 1);

    public RabbitMqRetrainQueueService(
        IConfiguration configuration,
        ILogger<RabbitMqRetrainQueueService> logger)
    {
        _logger           = logger;
        _connectionString = configuration["RabbitMQ:ConnectionString"] ?? "amqp://***REMOVED***@localhost:5672/";
    }

    // ── Bağlantı başlatıcı (lazy, thread-safe) ────────────────────────────────
    private async Task EnsureConnectedAsync()
    {
        if (_channel is { IsOpen: true }) return;

        await _connectLock.WaitAsync();
        try
        {
            if (_channel is { IsOpen: true }) return;

            var factory = new ConnectionFactory { Uri = new Uri(_connectionString) };
            _connection = await factory.CreateConnectionAsync();
            _channel    = await _connection.CreateChannelAsync();

            // Kuyruğu idempotent olarak tanımla; sunucu yeniden başlasa bile kuyruk sağ kalır.
            await _channel.QueueDeclareAsync(
                queue:      QueueName,
                durable:    true,   // RabbitMQ yeniden başlayınca mesajlar kaybolmaz
                exclusive:  false,
                autoDelete: false,
                arguments:  null);

            _logger.LogInformation("RabbitMQ bağlantısı kuruldu. Kuyruk: {Queue}", QueueName);
        }
        finally
        {
            _connectLock.Release();
        }
    }

    // ── Ana yayınlama metodu ──────────────────────────────────────────────────
    public async Task<bool> PublishRetrainJobAsync(int? triggeredByAdminId = null)
    {
        try
        {
            await EnsureConnectedAsync();

            var payload = new
            {
                jobType          = "retrain",
                triggeredAt      = DateTime.UtcNow,
                triggeredByAdmin = triggeredByAdminId
            };

            var bodyBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));

            // Mesajı kalıcı olarak işaretle: broker yeniden başlasa bile kuyrukta kalır
            var props = new BasicProperties
            {
                Persistent   = true,
                ContentType  = "application/json"
            };

            await _channel!.BasicPublishAsync(
                exchange:    ExchangeName,
                routingKey:  QueueName,
                mandatory:   false,
                basicProperties: props,
                body:        bodyBytes);

            _logger.LogInformation(
                "Yeniden eğitim işi kuyruğa eklendi. Kuyruk: {Queue}, TriggeredBy: {AdminId}",
                QueueName, triggeredByAdminId?.ToString() ?? "system");

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "RabbitMQ kuyruğuna yeniden eğitim işi eklenirken hata oluştu.");
            return false;
        }
    }

    // ── Sağlık kontrolü ───────────────────────────────────────────────────────
    public async Task<bool> IsHealthyAsync()
    {
        try
        {
            await EnsureConnectedAsync();
            return _channel is { IsOpen: true };
        }
        catch
        {
            return false;
        }
    }

    // ── Temizlik ──────────────────────────────────────────────────────────────
    public async ValueTask DisposeAsync()
    {
        if (_channel is not null)
        {
            await _channel.CloseAsync();
            _channel.Dispose();
        }

        if (_connection is not null)
        {
            await _connection.CloseAsync();
            _connection.Dispose();
        }

        _connectLock.Dispose();
    }
}
