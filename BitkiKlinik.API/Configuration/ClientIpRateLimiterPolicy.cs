using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

namespace BitkiKlinik.API.Configuration;

/// <summary>
/// Auth endpoint'leri için IP başına sliding-window limiti uygular.
/// "AuthPolicy" adlı limiter'a bağlanır.
/// </summary>
public sealed class ClientIpRateLimiterPolicy : IRateLimiterPolicy<string>
{
    // X-Forwarded-For başlığını destekle (reverse proxy arkasındaki IP)
    public RateLimitPartition<string> GetPartition(HttpContext httpContext)
    {
        var ip = httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault()
                 ?? httpContext.Connection.RemoteIpAddress?.ToString()
                 ?? "unknown";

        return RateLimitPartition.GetSlidingWindowLimiter(ip, _ =>
            new SlidingWindowRateLimiterOptions
            {
                Window            = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 4,
                PermitLimit       = 10,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit        = 0,
            });
    }

    public Func<OnRejectedContext, CancellationToken, ValueTask>? OnRejected =>
        (context, _) =>
        {
            context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            return ValueTask.CompletedTask;
        };
}
