namespace BitkiKlinik.API.DTOs;

public class DiseaseDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

/// <summary>
/// Hastalık + tedavi bilgisini tek sorguda taşır.
/// DiseasesController.GetAllDiseases N+1 sorununu çözmek için kullanılır.
/// </summary>
public class DiseaseWithTreatmentsDTO
{
    public int    Id          { get; set; }
    public string Name        { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ModelLabel  { get; set; } = string.Empty;
    public TreatmentsResultDTO Treatments { get; set; } = new();
}

public class DiagnosticResultDTO
{
    public DiseaseDTO Disease { get; set; } = new DiseaseDTO();

    /// <summary>
    /// Treatments grouped into Natural and Chemical categories.
    /// </summary>
    public TreatmentsResultDTO Treatments { get; set; } = new TreatmentsResultDTO();
}

