@echo off
title BitkiKlinik Kontrol Paneli

:MENU
cls
echo ============================================================
echo      BitkiKlinik - Sistem Baslama Kontrol Paneli
echo ============================================================
echo.
echo   1 - Docker Modu
echo       Veritabani, RabbitMQ, ML API ve .NET API docker ile calisir.
echo       Mobil uygulama Expo lokalde baslatilir.
echo.
echo   2 - Sistemleri Kapat - Docker Down
echo       Calisan tum Docker konteynerleri durdurulur.
echo.
echo   3 - Cikis
echo.
echo ============================================================
echo.

choice /c 123 /n /m "Seciminiz (1-3): "
set secim=%errorlevel%

if "%secim%"=="1" goto DOCKER_MODE
if "%secim%"=="2" goto DOCKER_DOWN
if "%secim%"=="3" goto EXIT_APP
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