using System;

namespace BitkiKlinik.API.Models;

public class DiseaseRiskAlert
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public Users User { get; set; } = null!;
    public string DiseaseName { get; set; } = string.Empty;
    public float RiskPercentage { get; set; }
    public string RiskLevel { get; set; } = string.Empty; // Low, Medium, High
    public string Suggestion { get; set; } = string.Empty; // Advice for farmers
    public DateTime CalculatedAt { get; set; } = DateTime.UtcNow;
}
