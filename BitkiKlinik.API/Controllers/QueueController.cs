using System.Net.Http.Headers;
using System.Text.Json;
using BitkiKlinik.API.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

[Route("api/admin/queue")]
[Authorize(Roles = "Admin")]
[ApiController]
public class QueueController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<QueueController> _logger;

    public QueueController(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<QueueController> logger)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpGet("rabbitmq-metrics")]
    public async Task<IActionResult> GetRabbitMqMetrics()
    {
        var connectionString = _configuration["RabbitMQ:ConnectionString"] ?? "amqp://***REMOVED***@localhost:5672/";
        var queueName = _configuration["RabbitMQ:QueueName"] ?? "bitkiklinik.retrain";

        var metrics = new RabbitMqMetricsDTO
        {
            QueueName = queueName,
            Status = "Unavailable",
            IsHealthy = false
        };

        try
        {
            var uri = new Uri(connectionString);
            var host = uri.Host;
            
            // Basic Auth kimlik bilgilerini çöz
            var userInfo = string.IsNullOrEmpty(uri.UserInfo) ? "***REMOVED***" : uri.UserInfo;
            var parts = userInfo.Split(':');
            var username = parts[0];
            var password = parts.Length > 1 ? parts[1] : "";

            // Docker container içi veya local dışı için http portu 15672'dir.
            var managementUrl = $"http://{host}:15672/api/queues/%2F/{queueName}";

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(5);

            var authBytes = System.Text.Encoding.UTF8.GetBytes($"{username}:{password}");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(authBytes));

            _logger.LogInformation("Connecting to RabbitMQ Management API at {Url}", managementUrl);

            var response = await client.GetAsync(managementUrl);
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(content);
                var root = doc.RootElement;

                metrics.PendingJobs = root.TryGetProperty("messages_ready", out var readyProp) ? readyProp.GetInt32() : 0;
                metrics.ActiveJobs = root.TryGetProperty("messages_unacknowledged", out var unackedProp) ? unackedProp.GetInt32() : 0;
                metrics.ActiveWorkers = root.TryGetProperty("consumers", out var consumersProp) ? consumersProp.GetInt32() : 0;
                metrics.Status = root.TryGetProperty("status", out var statusProp) ? statusProp.GetString() ?? "running" : "running";
                metrics.IsHealthy = true;

                // Message stat oranları (deliver ve publish detayları)
                if (root.TryGetProperty("message_stats", out var statsElement))
                {
                    if (statsElement.TryGetProperty("publish_details", out var pubDetails))
                    {
                        metrics.PublishRate = pubDetails.TryGetProperty("rate", out var pRate) ? pRate.GetDouble() : 0.0;
                    }
                    if (statsElement.TryGetProperty("deliver_get_details", out var delDetails))
                    {
                        metrics.DeliverRate = delDetails.TryGetProperty("rate", out var dRate) ? dRate.GetDouble() : 0.0;
                    }
                }
            }
            else
            {
                _logger.LogWarning("RabbitMQ Management API responded with status: {StatusCode}", response.StatusCode);
                metrics.Status = $"Error: {response.StatusCode}";
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch RabbitMQ metrics from management API at host.");
            metrics.Status = "Offline/Error";
        }

        return Ok(metrics);
    }
}
