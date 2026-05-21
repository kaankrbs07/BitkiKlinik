namespace BitkiKlinik.API.DTOs;

public class ActiveLearningPendingDTO
{
    public int Id { get; set; }
    public int? ScanId { get; set; }
    public string ImageUrl { get; set; } = string.Empty;
    public string PredictedDisease { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public string Source { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class ActiveLearningResolveDTO
{
    public int QueueId { get; set; }
    public string CorrectedDisease { get; set; } = string.Empty;
}

public class ActiveLearningStatsDTO
{
    public int PendingCount { get; set; }
    public int ResolvedCount { get; set; }
    public int TotalCount { get; set; }
}

public class RetrainResponseDTO
{
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}

public class FlagScanDTO
{
    public string? Reason { get; set; }
}
