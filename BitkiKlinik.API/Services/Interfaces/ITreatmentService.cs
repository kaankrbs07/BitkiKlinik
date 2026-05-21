using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.API.Services.Interfaces;

public interface ITreatmentService
{
    Task<TreatmentsResultDTO> GetTreatmentsByDiseaseIdAsync(int diseaseId);
}
