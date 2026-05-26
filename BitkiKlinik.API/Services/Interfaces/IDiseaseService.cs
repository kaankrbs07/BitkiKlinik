using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;

namespace BitkiKlinik.API.Services.Interfaces;

public interface IDiseaseService : IGenericService<Disease>
{
    /// <summary>Python modelinden gelen etiket ile hastalığı eşleştirir.</summary>
    Task<Disease?> GetByModelLabelAsync(string modelLabel);

    /// <summary>
    /// Tüm hastalıkları ve ilişkili tedavilerini TEK sorguda yükler.
    /// GetAllAsync + GetTreatmentsByDiseaseIdAsync döngüsü (N+1) yerine kullanılır.
    /// </summary>
    Task<IEnumerable<DiseaseWithTreatmentsDTO>> GetAllWithTreatmentsAsync();
}

