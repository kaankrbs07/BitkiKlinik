using System.Threading.Tasks;

namespace BitkiKlinik.API.Services.Interfaces;

public interface IWeatherService
{
    Task<WeatherForecastData?> GetHourlyForecastAsync(double latitude, double longitude);
}

public class WeatherForecastData
{
    public HourlyData Hourly { get; set; } = new();
}

public class HourlyData
{
    public string[] Time { get; set; } = Array.Empty<string>();
    public float[] Temperature_2m { get; set; } = Array.Empty<float>();
    public float[] Relative_Humidity_2m { get; set; } = Array.Empty<float>();
}
