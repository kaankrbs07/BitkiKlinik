namespace BitkiKlinik.API.DTOs;

// ─────────────────────────────────────────────────────────────────────
//  Disease Admin DTOs
// ─────────────────────────────────────────────────────────────────────

/// <summary>
/// Admin panelinde hastalık listesi görüntülemek için kullanılır.
/// Tedavi sayılarını içerir — admin detay görmeden genel durumu anlar.
/// </summary>
public class AdminDiseaseResponseDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ModelLabel { get; set; } = string.Empty;
    public int TreatmentCount { get; set; }
}

/// <summary>
/// Admin tarafından yeni hastalık oluşturmak için kullanılır.
/// İsteğe bağlı olarak tedavilerle birlikte tek seferde oluşturulabilir.
/// </summary>
public class AdminCreateDiseaseDTO
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ModelLabel { get; set; } = string.Empty;
    public List<AdminCreateTreatmentDTO>? Treatments { get; set; }
}

/// <summary>
/// Admin tarafından mevcut hastalığı güncellemek için kullanılır.
/// </summary>
public class AdminUpdateDiseaseDTO
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? ModelLabel { get; set; }
}

// ─────────────────────────────────────────────────────────────────────
//  Treatment Admin DTOs
// ─────────────────────────────────────────────────────────────────────

/// <summary>
/// Admin tarafından yeni tedavi oluşturmak için kullanılır.
/// </summary>
public class AdminCreateTreatmentDTO
{
    public string Title { get; set; } = string.Empty;
    public string Instructions { get; set; } = string.Empty;

    /// <summary>"Natural" veya "Chemical"</summary>
    public string Type { get; set; } = "Natural";
}

/// <summary>
/// Admin tarafından mevcut tedaviyi güncellemek için kullanılır.
/// </summary>
public class AdminUpdateTreatmentDTO
{
    public string? Title { get; set; }
    public string? Instructions { get; set; }
    public string? Type { get; set; }
}

/// <summary>
/// Hastalık detayı + tedavileri ile birlikte döndüren tam DTO.
/// </summary>
public class AdminDiseaseDetailDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ModelLabel { get; set; } = string.Empty;
    public List<TreatmentDTO> Treatments { get; set; } = new();
}
