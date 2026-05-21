using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Admin panelindeki hastalık ve tedavi yönetimi iş mantığını soyutlar.
/// Birden çok entity'yi kapsayan işlemleri (ör: hastalık + tedaviler birlikte oluşturma)
/// orkestre eder — controller'lar bu arayüze bağımlıdır.
/// </summary>
public interface IAdminDiseaseService
{
    /// <summary>Tüm hastalıkları tedavi sayılarıyla birlikte listeler.</summary>
    Task<IEnumerable<AdminDiseaseResponseDTO>> GetAllDiseasesAsync();

    /// <summary>Hastalığı tedavileriyle birlikte detaylı döndürür.</summary>
    Task<AdminDiseaseDetailDTO?> GetDiseaseDetailAsync(int diseaseId);

    /// <summary>Yeni hastalık (opsiyonel tedavilerle birlikte) oluşturur.</summary>
    Task<AdminDiseaseDetailDTO> CreateDiseaseAsync(AdminCreateDiseaseDTO dto);

    /// <summary>Mevcut hastalığı günceller.</summary>
    Task<AdminDiseaseDetailDTO?> UpdateDiseaseAsync(int diseaseId, AdminUpdateDiseaseDTO dto);

    /// <summary>Hastalığı ve bağlı tedavilerini siler.</summary>
    Task<bool> DeleteDiseaseAsync(int diseaseId);

    // ── Tedavi Yönetimi ──────────────────────────────────────────

    /// <summary>Belirtilen hastalığa yeni tedavi ekler.</summary>
    Task<TreatmentDTO> AddTreatmentToDiseaseAsync(int diseaseId, AdminCreateTreatmentDTO dto);

    /// <summary>Mevcut tedaviyi günceller.</summary>
    Task<TreatmentDTO?> UpdateTreatmentAsync(int treatmentId, AdminUpdateTreatmentDTO dto);

    /// <summary>Tedaviyi siler.</summary>
    Task<bool> DeleteTreatmentAsync(int treatmentId);
}
