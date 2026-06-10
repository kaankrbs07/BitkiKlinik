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

public class RetrainStatusDTO
{
    public string Status { get; set; } = string.Empty;
    public double Progress { get; set; }
    public string? Error { get; set; }
    public string? LastTrainedAt { get; set; }
    public int TotalSamples { get; set; }
    public int CurrentSamples { get; set; }
    public Dictionary<string, int> SamplesBreakdown { get; set; } = new();
}

public class RetrainHistoryDTO
{
    public DateTime TrainedAt { get; set; }
    public int Epochs { get; set; }
    public double TrainLoss { get; set; }
    public double TrainAcc { get; set; }
    public double ValLoss { get; set; }
    public double ValAcc { get; set; }
    public int TotalSamples { get; set; }
    public int AlSamples { get; set; }
    public int BufferSamples { get; set; }
    public string? TriggeredBy { get; set; }
    public DateTime? StartedAt { get; set; }
    public double? DurationSeconds { get; set; }
}

public class ActiveLearningClassDistributionDTO
{
    public string ClassLabel { get; set; } = string.Empty;
    public int Count { get; set; }
}

