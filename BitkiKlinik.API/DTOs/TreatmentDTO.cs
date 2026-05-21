using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.DTOs;

/// <summary>
/// Flat DTO returned to the client for a single treatment.
/// </summary>
public class TreatmentDTO
{
    public int Id { get; set; }

    /// <summary>
    /// "Natural" or "Chemical" — sent as a string so mobile clients don't need enum knowledge.
    /// </summary>
    public string Type { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;
    public string Instructions { get; set; } = string.Empty;
}

/// <summary>
/// Groups treatments by type for a disease diagnosis response.
/// </summary>
public class TreatmentsResultDTO
{
    public IEnumerable<TreatmentDTO> NaturalTreatments { get; set; } = new List<TreatmentDTO>();
    public IEnumerable<TreatmentDTO> ChemicalTreatments { get; set; } = new List<TreatmentDTO>();
}
