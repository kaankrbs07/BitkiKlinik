using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.Services.Interfaces;

public interface IActiveLearningService
{
    Task EnqueueAsync(int? scanId, string imagePath, string predictedDisease, double confidence, ActiveLearningSource source);
    Task<List<ActiveLearningPendingDTO>> GetPendingAsync(int page, int pageSize);
    Task<ActiveLearningStatsDTO> GetStatsAsync();
    Task<bool> ResolveAsync(int queueId, string correctedDisease);
    Task<bool> IgnoreAsync(int queueId);
    Task<bool> FlagScanAsync(int scanId);
    Task<RetrainResponseDTO> TriggerRetrainAsync();
    Task<RetrainStatusDTO?> GetRetrainStatusAsync();
    Task<List<RetrainHistoryDTO>?> GetRetrainHistoryAsync();
    Task<List<ActiveLearningClassDistributionDTO>> GetClassDistributionAsync();
    Task BackupModelToB2Async();
}
