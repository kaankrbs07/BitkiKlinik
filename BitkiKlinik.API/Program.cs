using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using BitkiKlinik.API.Configuration;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.HostedServices;
using BitkiKlinik.API.Services;
using BitkiKlinik.API.Services.Interfaces;
using BitkiKlinik.API.Services.Implementations;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using NLog;
using NLog.Web;
using BitkiKlinik.API.Middlewares;

var builder = WebApplication.CreateBuilder(args);

// NLog: Setup NLog for Dependency injection
builder.Logging.ClearProviders();
builder.Host.UseNLog();

// Add services to the container.
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
builder.Services.AddSingleton<IFileStorageService, LocalFileStorageService>();
builder.Services.AddScoped<IProfileService, ProfileService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IScanService, ScanService>();
builder.Services.AddScoped<IAdminDiseaseService, AdminDiseaseService>();
builder.Services.AddScoped<IActiveLearningService, ActiveLearningService>();
builder.Services.AddScoped<IGeminiService, GeminiService>();

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

app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<RequestResponseLoggingMiddleware>();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseStaticFiles(); // wwwroot/uploads/scans altındaki görselleri serve eder

app.UseRateLimiter();
app.UseCors("AllowAllOrigins");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();


app.Run();
