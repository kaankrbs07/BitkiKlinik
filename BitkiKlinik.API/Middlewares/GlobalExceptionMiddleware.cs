using Microsoft.Data.SqlClient;

namespace BitkiKlinik.API.Middlewares;

/// <summary>
/// Controllerlardan kaçan işlenmemiş exception'ları yakalar ve tutarlı bir JSON hata yanıtı döner.
///
/// ÖNEMLI: ArgumentException bu middleware'de kasıtlı olarak yakalanmıyor.
/// Her controller kendi ArgumentException'larını daha spesifik kullanıcı mesajlarıyla
/// handle eder. Bu middleware yalnızca gerçekten beklenmedik hataları kapsar.
/// </summary>
public sealed class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task Invoke(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            var traceId = context.TraceIdentifier;
            var (message, status) = MapToError(ex);

            _logger.LogError(ex, "Unhandled exception message={Message} traceId={TraceId} path={Path}",
                message, traceId, context.Request.Path);

            context.Response.StatusCode  = status;
            context.Response.ContentType = "application/json";
            context.Response.Headers["X-Correlation-ID"] = traceId;

            await context.Response.WriteAsJsonAsync(new { Error = message });
        }
    }

    private static (string Message, int Status) MapToError(Exception ex) => ex switch
    {
        SqlException                => ("Veritabanında bir hata oluştu.",   StatusCodes.Status500InternalServerError),
        UnauthorizedAccessException => ("Bu kaynağa erişim izniniz yok.",   StatusCodes.Status401Unauthorized),
        KeyNotFoundException        => ("İstenen kaynak bulunamadı.",        StatusCodes.Status404NotFound),
        // ArgumentException kasıtlı olarak çıkarıldı: her controller kendi mesajıyla handle eder.
        _                          => ("Beklenmeyen bir hata oluştu.",       StatusCodes.Status500InternalServerError)
    };
}

