@echo off
title BitkiKlinik Kontrol Paneli

:MENU
cls
echo ============================================================
echo      BitkiKlinik - Sistem Baslama Kontrol Paneli
echo ============================================================
echo.
echo   1 - Docker Modu (TAVSIYE EDILEN)
echo       Veritabani, RabbitMQ, ML API ve .NET API docker ile calisir.
echo       Mobil uygulama Expo lokalde baslatilir.
echo.
echo   2 - Lokal Gelistirme Modu
echo       Sadece RabbitMQ docker icerisinde calisir.
echo       ML API, .NET API ve Mobil uygulama lokalde baslatilir.
echo.
echo   3 - Sistemleri Kapat - Docker Down
echo       Calisan tum Docker konteynerleri durdurulur.
echo.
echo   4 - Cikis
echo.
echo ============================================================
echo.

choice /c 1234 /n /m "Seciminiz (1-4): "
set secim=%errorlevel%

if "%secim%"=="1" goto DOCKER_MODE
if "%secim%"=="2" goto LOCAL_MODE
if "%secim%"=="3" goto DOCKER_DOWN
if "%secim%"=="4" goto EXIT_APP
if not "%secim%"=="255" goto MENU

echo.
echo ============================================================
echo  HATA: Bu betik bir IDE terminali icerisinden calistirildi.
echo  Cozum: start_all.bat dosyasini Dosya Gezgini'nden cift tiklayin.
echo  veya normal cmd.exe penceresi acip orada calistirin.
echo ============================================================
echo.
pause
exit /b

:DOCKER_MODE
cls
echo Docker Servisleri Baslatiliyor...
echo.
start "BitkiKlinik_Docker" cmd /k "docker-compose up --build"
echo Docker servislerinin hazir olmasi bekleniyor (10 saniye)...
timeout /t 10 /nobreak > nul
echo.
start "Mobile_App_Expo" cmd /k "cd /d "%~dp0BitkiKlinik" && npm start"
echo.
echo ------------------------------------------------------------
echo   DOCKER MODU BASLATILDI
echo   RabbitMQ Panel   : http://localhost:15672  guest/guest
echo   ML API FastAPI   : http://localhost:8000/health
echo   .NET API         : http://localhost:5000
echo ------------------------------------------------------------
echo.
pause
goto MENU

:LOCAL_MODE
cls
echo Lokal Gelistirme Modu Baslatiliyor...
echo.

echo [1/5] RabbitMQ konteyner durumu kontrol ediliyor...
docker inspect bitkiklinik-rabbitmq >nul 2>&1
if %errorlevel% neq 0 (
    echo RabbitMQ konteyneri bulunamadi, yenisi olusturuluyor...
    docker run -d --name bitkiklinik-rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
    timeout /t 5 /nobreak > nul
) else (
    docker start bitkiklinik-rabbitmq >nul 2>&1
    echo RabbitMQ calisiyor.
)

echo [2/5] Python AI Servisi baslatiliyor Port 8000...
start "AI_Inference_FastAPI" cmd /k "cd /d "%~dp0BitkiKlinik.ML" && venv\Scripts\activate && python -m uvicorn serve:app --host 0.0.0.0 --port 8000"

echo [3/5] Python Retrain Worker baslatiliyor...
start "AI_Retrain_Worker" cmd /k "cd /d "%~dp0BitkiKlinik.ML" && venv\Scripts\activate && python retrain_worker.py"

echo [4/5] .NET Backend API baslatiliyor...
start "Backend_API_NET" cmd /k "cd /d "%~dp0BitkiKlinik.API" && dotnet run --launch-profile http"

echo [5/5] Mobil Uygulama Expo baslatiliyor...
start "Mobile_App_Expo" cmd /k "cd /d "%~dp0BitkiKlinik" && npm start"

echo.
echo ------------------------------------------------------------
echo   LOKAL SERVISLER BASLATILDI
echo   RabbitMQ Panel   : http://localhost:15672  guest/guest
echo   ML API FastAPI   : http://localhost:8000
echo   .NET API         : http://localhost:5135
echo   Hangfire         : http://localhost:5135/hangfire
echo ------------------------------------------------------------
echo.
pause
goto MENU

:DOCKER_DOWN
cls
echo Docker Konteynerleri Kapatiliyor...
echo.
docker-compose down
echo.
echo Tum servisler kapatildi ve temizlendi.
echo.
pause
goto MENU

:EXIT_APP
cls
echo BitkiKlinik sistemi kapatiliyor. Iyi calismalar!
timeout /t 2 /nobreak > nul
exit