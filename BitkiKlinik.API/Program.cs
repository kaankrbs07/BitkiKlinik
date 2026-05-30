using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using BitkiKlinik.API.Configuration;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.HostedServices;
using BitkiKlinik.API.Jobs;
using BitkiKlinik.API.Services;
using BitkiKlinik.API.Services.Interfaces;
using BitkiKlinik.API.Services.Implementations;
using Hangfire;
using Hangfire.SqlServer;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using NLog;
using NLog.Web;
using BitkiKlinik.API.Middlewares;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

// NLog: Setup NLog for Dependency injection
builder.Logging.ClearProviders();
builder.Host.UseNLog();

// Add services to the container.
builder.Services.AddMemoryCache();
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));


// Named HttpClient: PlantAnalysisService tarafından IHttpClientFactory aracılığıyla kullanılır
builder.Services.AddHttpClient("PythonApiClient", (serviceProvider, client) =>
{
    var config  = serviceProvider.GetRequiredService<IConfiguration>();
    var baseUrl = config["PythonApi:BaseUrl"] ?? "http://localhost:8000";
    var timeout = int.Parse(config["PythonApi:TimeoutSeconds"] ?? "30");
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout     = TimeSpan.FromSeconds(timeout);
});
builder.Services.AddScoped(typeof(IGenericService<>), typeof(GenericService<>));
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IDiseaseService, DiseaseService>();
builder.Services.AddScoped<ITreatmentService, TreatmentService>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IPasswordHasher, BcryptPasswordHasher>();
builder.Services.AddScoped<IPlantAnalysisService, PlantAnalysisService>();

// Depolama sağlayıcısına göre uygun servisi register ediyoruz
var storageProvider = builder.Configuration["FileStorage:Provider"];
if (storageProvider == "Backblaze")
{
    builder.Services.AddSingleton<IFileStorageService, B2FileStorageService>();
}
else
{
    builder.Services.AddSingleton<IFileStorageService, LocalFileStorageService>();
}

builder.Services.AddScoped<IProfileService, ProfileService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IScanService, ScanService>();
builder.Services.AddScoped<IAdminDiseaseService, AdminDiseaseService>();
builder.Services.AddScoped<IActiveLearningService, ActiveLearningService>();
builder.Services.AddScoped<IScanOrchestrationService, ScanOrchestrationService>();
builder.Services.AddScoped<IGeminiService, GeminiService>();
builder.Services.AddScoped<IWeatherService, WeatherService>();
builder.Services.AddHttpClient();

// ── Hangfire Arka Plan İş Yöneticisi ──────────────────────────────────────────
// E-posta ve Push bildirimleri artık güvenilir Hangfire kuyrukları üzerinden çalışır.
// Görevler SQL Server'da kalıcı; uygulama yeniden başlasa bile tamamlanmamış işler devam eder.
var hangfireConnectionString = builder.Configuration.GetConnectionString("DefaultConnection")!;
builder.Services.AddHangfire(config => config
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseSqlServerStorage(hangfireConnectionString, new SqlServerStorageOptions
    {
        CommandBatchMaxTimeout       = TimeSpan.FromMinutes(5),
        SlidingInvisibilityTimeout   = TimeSpan.FromMinutes(5),
        QueuePollInterval            = TimeSpan.Zero,
        UseRecommendedIsolationLevel = true,
        DisableGlobalLocks           = true
    }));
builder.Services.AddHangfireServer(options =>
{
    options.WorkerCount = Environment.ProcessorCount * 2; // CPU başına 2 worker
});

// ── Hangfire Job Sınıfları ────────────────────────────────────────────────────
builder.Services.AddScoped<IEmailJob, EmailJob>();
builder.Services.AddScoped<IPushNotificationJob, PushNotificationJob>();

// ── RabbitMQ Retrain Kuyruk Servisi ──────────────────────────────────────────
// Singleton: bağlantı bir kez kurulur, tüm istek döngüleri paylaşır.
builder.Services.AddSingleton<IRetrainQueueService, RabbitMqRetrainQueueService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            RoleClaimType = System.Security.Claims.ClaimTypes.Role
        };
    });

builder.Services.AddRateLimiter(options =>
{
    // ── Global limiter: tüm endpoint'ler ─────────────────────────────
    options.AddFixedWindowLimiter("FixedPolicy", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = 100;
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });

    // ── Auth limiter: IP başına kaba-kuvvet koruması ──────────────────
    // AuthController endpoint'leri [EnableRateLimiting("AuthPolicy")] ile işaretlenmiştir.
    options.AddPolicy<string, ClientIpRateLimiterPolicy>("AuthPolicy");

    // ── Chat limiter: dakikada 20 mesaj sınırı ────────────────────────
    // ChatController POST endpoint'i [EnableRateLimiting("ChatPolicy")] ile işaretlenmiştir.
    options.AddSlidingWindowLimiter("ChatPolicy", opt =>
    {
        opt.Window               = TimeSpan.FromMinutes(1);
        opt.PermitLimit          = 20;
        opt.SegmentsPerWindow    = 4;
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit           = 0;
    });

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});


builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAllOrigins", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// ── Arka Plan Servisleri ───────────────────────────────────────────────────
// Düşük güvenli geçmiş taramaları aktif öğrenme kuyruğuna taşır (Program.cs'ten ayrıldı).
builder.Services.AddHostedService<ActiveLearningBackfillService>();
builder.Services.AddHostedService<DiseaseRiskForecastingService>();

// ── Reverse Proxy / Load Balancer Desteği ──────────────────────────────────
// Rate Limiter'ın Docker, Cloudflare veya Nginx arkasındaki gerçek kullanıcı IP'lerini
// (X-Forwarded-For) doğru okuması için Forwarded Headers etkinleştirilir.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // IP maskeleme sorunlarını önlemek için proxy ağlarına güven:
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

// Ensure active-learning directory exists
var activeLearningPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "active-learning");
if (!Directory.Exists(activeLearningPath))
{
    Directory.CreateDirectory(activeLearningPath);
}

// ── Veritabanı Migration + Seed ───────────────────────────────────────────────
// Tablolar boşsa hastalık ve tedavi verilerini yükler (idempotent).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();
    await SeedData.InitialiseAsync(db);
}

// ── Yerel Dosyaları Buluta Taşıma (Storage Migration) ────────────────────────
// Backblaze B2 aktifse, yerel uploads altındaki tüm eski dosyaları otomatik buluta taşır (idempotent).
using (var scope = app.Services.CreateScope())
{
    var storageService = scope.ServiceProvider.GetRequiredService<IFileStorageService>();
    var webHostEnvironment = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
    try
    {
        await storageService.MigrateLocalFilesAsync(webHostEnvironment.WebRootPath);
    }
    catch (Exception ex)
    {
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Eski dosyalar Backblaze B2'ye taşınırken hata oluştu.");
    }
}


app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<RequestResponseLoggingMiddleware>();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    // HTTPS redirection is only activated if an HTTPS port is configured or explicitly enabled.
    // This avoids warnings and potential redirect loops when running in Docker or behind reverse proxies where SSL is terminated at the gateway.
    var httpsPort = builder.Configuration["ASPNETCORE_HTTPS_PORT"] ?? builder.Configuration["HTTPS_PORT"];
    var enableHttpsRedirection = builder.Configuration.GetValue<bool>("EnableHttpsRedirection", false);

    if (!string.IsNullOrEmpty(httpsPort) || enableHttpsRedirection)
    {
        app.UseHttpsRedirection();
    }
}
app.UseStaticFiles(); // wwwroot/uploads/scans altındaki görselleri serve eder

app.UseForwardedHeaders(); // RateLimiter'dan önce çağrılmalıdır!
app.UseRateLimiter();
app.UseCors("AllowAllOrigins");

app.UseAuthentication();
app.UseAuthorization();

// ── Hangfire Dashboard (Yalnızca Admin) ───────────────────────────────────────
// /hangfire endpoint'ine yalnızca Admin rolüyle erişilebilir.
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [new Hangfire.Dashboard.LocalRequestsOnlyAuthorizationFilter()],
    DashboardTitle  = "BitkiKlinik Arka Plan İşleri"
});

// ── HTTP 302 Redirection Gateway for B2 Storage ──────────────────────────────
// Yerel diskte bulunmayan (UseStaticFiles'dan pas geçen) görseller için
// Backblaze B2 üzerinden anlık geçici imzalı link üretip tarayıcıyı/mobil uygulamayı oraya yönlendirir.
app.MapGet("/uploads/{subDirectory}/{fileName}", (
    string subDirectory,
    string fileName,
    IFileStorageService storageService) =>
{
    var relativePath = $"uploads/{subDirectory}/{fileName}";
    var targetUrl = storageService.GetFileUrl(relativePath);
    
    if (!string.IsNullOrEmpty(targetUrl) && targetUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase))
    {
        return Results.Redirect(targetUrl);
    }
    
    return Results.NotFound();
});

app.MapControllers();


app.Run();
