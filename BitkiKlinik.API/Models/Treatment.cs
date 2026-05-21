using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.Models;

/// <summary>
/// Represents a single treatment recommendation (natural or chemical).
/// Replaces the old OrganicSolution and ChemicalSolution entities.
/// </summary>
public class Treatment
{
    public int Id { get; set; }

    /// <summary>
    /// Discriminator: Natural = 1, Chemical = 2.
    /// Stored as an integer column in MSSQL.
    /// </summary>
    public TreatmentType Type { get; set; }

    /// <summary>
    /// Short display name for the treatment (e.g. "Neem Oil Spray").
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Step-by-step application instructions for the treatment.
    /// </summary>
    public string Instructions { get; set; } = string.Empty;

    // Navigation property for the many-to-many join table
    public ICollection<DiseaseTreatment> DiseaseTreatments { get; set; } = new List<DiseaseTreatment>();
}
