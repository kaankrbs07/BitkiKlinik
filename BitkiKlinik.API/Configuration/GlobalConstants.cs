namespace BitkiKlinik.API.Configuration;

public static class GlobalConstants
{
    /// <summary>
    /// Aktif öğrenme mekanizması için kabul edilen güven eşik değeri (0.65).
    /// Bu değerin altındaki taramalar otomatik olarak aktif öğrenme kuyruğuna eklenir.
    /// </summary>
    public const double ActiveLearningThreshold = 0.65;
}
