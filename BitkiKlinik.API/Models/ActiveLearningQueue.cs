using BitkiKlinik.API.Models.Enums;

namespace BitkiKlinik.API.Models;

public class ActiveLearningQueue
{
    public int Id { get; set; }
    public int? ScanId { get; set; }
    public PlantScan? Scan { get; set; }
    public string ImagePath { get; set; } = string.Empty;
    public string PredictedDisease { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public string? CorrectedDisease { get; set; }
    public ActiveLearningStatus Status { get; set; } = ActiveLearningStatus.Pending;
    public ActiveLearningSource Source { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
}
