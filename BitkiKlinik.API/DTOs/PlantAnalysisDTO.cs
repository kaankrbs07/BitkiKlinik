namespace BitkiKlinik.API.DTOs;

/// <summary>
/// Python mikroservisinden dönen ham JSON yanıtını deserialize etmek için kullanılır.
/// Beklenen format: { "disease": "Tomato_Blight", "confidence": 0.95 }
/// </summary>
public class PythonAnalysisResponseDTO
{
    public string Disease { get; set; } = string.Empty;
    public float Confidence { get; set; }
}

/// <summary>
/// PlantAnalysisService'in controller'a döndürdüğü birleşik sonuç nesnesi.
/// Python'dan gelen tahmin + yerel sunucuda kaydedilen görsel URL'ini içerir.
/// </summary>
public class PlantAnalysisResultDTO
{
    /// <summary>
    /// Python modelinin tahmin ettiği hastalık etiketi (örn. "Tomato__Blight").
    /// </summary>
    public string ModelLabel { get; set; } = string.Empty;

    /// <summary>
    /// Modelin güven skoru (0.0 - 1.0 arası).
    /// </summary>
    public float Confidence { get; set; }

    /// <summary>
    /// Yüklenen görselin mobil uygulamanın erişebileceği göreli URL'i.
    /// Örn: /uploads/scans/3f2a1b4c-....jpg
    /// </summary>
    public string ImageUrl { get; set; } = string.Empty;
}
