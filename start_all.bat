@echo off
echo ======================================================
echo BitkiKlinik Tum Servisler Baslatiliyor...
echo ======================================================

:: 1. Python AI Servisi (Port: 8000)
echo [1/3] Python AI Servisi baslatiliyor...
start "AI_Service_FastAPI" cmd /k "cd /d "%~dp0BitkiKlinik.ML" && venv\Scripts\activate && python -m uvicorn serve:app --host 0.0.0.0 --port 8000"

:: 2. .NET Backend API (Port: 5135)
echo [2/3] .NET Backend API baslatiliyor...
start "Backend_API_NET" cmd /k "cd /d "%~dp0BitkiKlinik.API" && dotnet run --launch-profile http"

:: 3. Mobil Uygulama (Port: 8081)
echo [3/3] Mobil Uygulama (Expo) baslatiliyor...
start "Mobile_App_Expo" cmd /k "cd /d "%~dp0BitkiKlinik" && npm start"

echo.
echo ------------------------------------------------------
echo Tum servisler yeni pencerelerde acildi.
echo LÜTFEN DIKKAT: Python servisinin modelini yuklemesi 
echo 5-10 saniye surebilir. Pencereyi takip edin.
echo ------------------------------------------------------
pause
