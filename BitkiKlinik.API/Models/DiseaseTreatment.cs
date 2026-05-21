namespace BitkiKlinik.API.Models;

/// <summary>
/// Junction / join table entity for the many-to-many relationship
/// between Disease and Treatment.
/// Maps to the "DiseaseTreatments" table in MSSQL.
/// </summary>
public class DiseaseTreatment
{
    public int DiseaseId { get; set; }
    public Disease? Disease { get; set; }

    public int TreatmentId { get; set; }
    public Treatment? Treatment { get; set; }
}
