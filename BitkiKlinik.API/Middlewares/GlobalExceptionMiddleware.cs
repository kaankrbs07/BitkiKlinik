using Microsoft.Data.SqlClient;

namespace BitkiKlinik.API.Middlewares;

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

            // Ayrıntılar logda:
            _logger.LogError(ex, "Unhandled exception message={Message} traceId={TraceId} path={Path}",
                message, traceId, context.Request.Path);

            // Kullanıcıya sadece KOD
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";

            // İzi header'a koy, body'de göstermiyoruz
            context.Response.Headers["X-Correlation-ID"] = traceId;

            await context.Response.WriteAsJsonAsync(new { Error = message });
        }
    }

    private static (string Message, int Status) MapToError(Exception ex) => ex switch
    {
        SqlException                => ("Veritabanında bir hata oluştu.", StatusCodes.Status500InternalServerError),
        UnauthorizedAccessException => ("Bu kaynağa erişim izniniz yok.", StatusCodes.Status401Unauthorized),
        KeyNotFoundException        => ("stenilen kaynak bulunamadı.", StatusCodes.Status404NotFound),
        ArgumentException           => ("Geçersiz istek verisi.", StatusCodes.Status400BadRequest),
        _                           => ("Beklenmeyen bir hata oluştu.", StatusCodes.Status500InternalServerError)
    };
}
