# ─────────────────────────────────────────────
#  BitkiKlinik API — Dockerfile
#  .NET 9 ASP.NET Core — çok aşamalı build
#    • build  → derleme aşaması
#    • final  → çalışma aşaması (minimal imaj)
# ─────────────────────────────────────────────

# ── Derleme Aşaması ───────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build

WORKDIR /src

# Önce proje dosyasını kopyala (restore cache avantajı)
COPY BitkiKlinik.API.csproj .
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet restore

# Kaynak kodun tamamını kopyala ve yayınla
COPY . .
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish -c Release -o /app/publish --no-restore

# ── Çalışma Aşaması ───────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final

WORKDIR /app

# Gerekli dizinleri oluştur
RUN mkdir -p wwwroot/uploads/scans wwwroot/uploads/active-learning

# Derlenen uygulamayı kopyala
COPY --from=build /app/publish .

EXPOSE 5000

ENTRYPOINT ["dotnet", "BitkiKlinik.API.dll"]
