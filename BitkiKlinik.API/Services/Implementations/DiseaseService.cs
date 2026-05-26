using BitkiKlinik.API.Data;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace BitkiKlinik.API.Services.Implementations;

public class DiseaseService : GenericService<Disease>, IDiseaseService
{
    private readonly ApplicationDbContext _context;

    public DiseaseService(ApplicationDbContext context) : base(context)
    {
        _context = context;
    }

    public async Task<Disease?> GetByModelLabelAsync(string modelLabel)
    {
        return await _context.Set<Disease>()
            .FirstOrDefaultAsync(d => d.ModelLabel.ToLower() == modelLabel.ToLower());
    }

    /// <summary>
    /// Tüm hastalıkları ve tedavilerini TEK SQL sorgusunda yükler (N+1 yok).
    /// DiseaseTreatments → Treatment ilişkisi Include ile eager-loaded edilir.
    /// </summary>
    public async Task<IEnumerable<DiseaseWithTreatmentsDTO>> GetAllWithTreatmentsAsync()
    {
        var diseases = await _context.Diseases
            .Include(d => d.DiseaseTreatments)
                .ThenInclude(dt => dt.Treatment)
            .AsNoTracking()   // read-only, change tracking kapalı → daha hızlı
            .OrderBy(d => d.Name)
            .ToListAsync();

        return diseases.Select(d => new DiseaseWithTreatmentsDTO
        {
            Id          = d.Id,
            Name        = d.Name,
            Description = d.Description,
            ModelLabel  = d.ModelLabel,
            Treatments  = new TreatmentsResultDTO
            {
                NaturalTreatments = d.DiseaseTreatments
                    .Where(dt => dt.Treatment?.Type == TreatmentType.Natural)
                    .Select(dt => new TreatmentDTO
                    {
                        Id           = dt.Treatment!.Id,
                        Type         = dt.Treatment.Type.ToString(),
                        Title        = dt.Treatment.Title,
                        Instructions = dt.Treatment.Instructions
                    }),
                ChemicalTreatments = d.DiseaseTreatments
                    .Where(dt => dt.Treatment?.Type == TreatmentType.Chemical)
                    .Select(dt => new TreatmentDTO
                    {
                        Id           = dt.Treatment!.Id,
                        Type         = dt.Treatment.Type.ToString(),
                        Title        = dt.Treatment.Title,
                        Instructions = dt.Treatment.Instructions
                    })
            }
        });
    }
}

