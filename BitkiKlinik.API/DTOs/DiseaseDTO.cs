namespace BitkiKlinik.API.DTOs;

public class DiseaseDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public class DiagnosticResultDTO
{
    public DiseaseDTO Disease { get; set; } = new DiseaseDTO();

    /// <summary>
    /// Treatments grouped into Natural and Chemical categories.
    /// </summary>
    public TreatmentsResultDTO Treatments { get; set; } = new TreatmentsResultDTO();
}
