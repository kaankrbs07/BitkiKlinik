using BitkiKlinik.API.Data;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace BitkiKlinik.API.Services.Implementations;

public class TreatmentService : ITreatmentService
{
    private readonly ApplicationDbContext _context;

    public TreatmentService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<TreatmentsResultDTO> GetTreatmentsByDiseaseIdAsync(int diseaseId)
    {
        // Single query: join DiseaseTreatments → Treatments, then split by Type
        var allTreatments = await _context.DiseaseTreatments
            .Where(dt => dt.DiseaseId == diseaseId)
            .Include(dt => dt.Treatment)
            .Select(dt => new TreatmentDTO
            {
                Id           = dt.Treatment!.Id,
                Type         = dt.Treatment.Type.ToString(),   // "Natural" or "Chemical"
                Title        = dt.Treatment.Title,
                Instructions = dt.Treatment.Instructions
            })
            .ToListAsync();

        return new TreatmentsResultDTO
        {
            NaturalTreatments  = allTreatments.Where(t => t.Type == TreatmentType.Natural.ToString()),
            ChemicalTreatments = allTreatments.Where(t => t.Type == TreatmentType.Chemical.ToString())
        };
    }
}
