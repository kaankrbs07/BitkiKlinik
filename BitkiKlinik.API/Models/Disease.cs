namespace BitkiKlinik.API.Models;

public class Disease
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ModelLabel { get; set; } = string.Empty;

    // Many-to-many relationship with Treatment via the DiseaseTreatment join table
    public ICollection<DiseaseTreatment> DiseaseTreatments { get; set; } = new List<DiseaseTreatment>();
}
