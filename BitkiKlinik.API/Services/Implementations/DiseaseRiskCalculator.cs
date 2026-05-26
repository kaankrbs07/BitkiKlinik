using System;
using BitkiKlinik.API.Services.Interfaces;

namespace BitkiKlinik.API.Services.Implementations;

public static class DiseaseRiskCalculator
{
    public static (float RiskPercentage, string RiskLevel, string Suggestion) CalculateMildewRisk(WeatherForecastData forecast)
    {
        if (forecast?.Hourly?.Temperature_2m == null || forecast.Hourly.Relative_Humidity_2m == null)
        {
            return (0f, "Düşük", "Hava durumu verisi bulunamadı.");
        }

        var temps = forecast.Hourly.Temperature_2m;
        var humidities = forecast.Hourly.Relative_Humidity_2m;

        if (temps.Length < 48 || humidities.Length < 48)
        {
            return (0f, "Düşük", "Yetersiz tahmin verisi mevcut.");
        }

        // Smith Period: Nem oranı en az 11 saat boyunca %90+ seyrettiği ve sıcaklığın 10°C+ olduğu 2 ardışık gün (48 saat)
        int day1Hours = 0;
        int day2Hours = 0;

        for (int i = 0; i < 24; i++)
        {
            if (temps[i] >= 10.0f && humidities[i] >= 90.0f)
            {
                day1Hours++;
            }
        }

        for (int i = 24; i < 48; i++)
        {
            if (temps[i] >= 10.0f && humidities[i] >= 90.0f)
            {
                day2Hours++;
            }
        }

        float day1Factor = Math.Min(day1Hours, 11) / 11.0f;
        float day2Factor = Math.Min(day2Hours, 11) / 11.0f;

        // Risk yüzdesi: her iki günün de Smith şartlarını sağlama oranının ortalamasıdır
        float riskPercentage = (day1Factor * 0.5f + day2Factor * 0.5f) * 100.0f;
        riskPercentage = (float)Math.Round(riskPercentage, 1);

        string riskLevel;
        string suggestion;

        if (riskPercentage < 35.0f)
        {
            riskLevel = "Düşük";
            suggestion = "Hava koşulları mantar hastalıkları için uygun değil. Bitkileriniz güvende!";
        }
        else if (riskPercentage < 75.0f)
        {
            riskLevel = "Orta";
            suggestion = "Nem seviyeleri yükseliyor. Bitkilerinizi yaprak ıslaklığı ve lekeler açısından düzenli kontrol edin.";
        }
        else
        {
            riskLevel = "Kritik";
            suggestion = "Mantar hastalığı (Mildiyö) riski kritik seviyede! Bitkilerinizi korumak için acilen koruyucu önlemler veya havalandırma planlayın.";
        }

        return (riskPercentage, riskLevel, suggestion);
    }
}
