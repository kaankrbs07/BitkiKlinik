using BitkiKlinik.API.Data;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Models.Enums;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace BitkiKlinik.API.Services.Implementations;

/// <summary>
/// Admin panelindeki hastalık ve tedavi yönetimi iş mantığını yürütür.
/// Tüm veritabanı işlemleri bu sınıfta izole edilmiştir —
/// controller asla doğrudan DbContext'e erişmez.
/// </summary>
public class AdminDiseaseService : IAdminDiseaseService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<AdminDiseaseService> _logger;

    public AdminDiseaseService(ApplicationDbContext context, ILogger<AdminDiseaseService> logger)
    {
        _context = context;
        _logger  = logger;
    }

    // ──────────────────────────────────────────────────────────────────
    //  Hastalık CRUD
    // ──────────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<IEnumerable<AdminDiseaseResponseDTO>> GetAllDiseasesAsync()
    {
        return await _context.Diseases
            .Include(d => d.DiseaseTreatments)
            .Select(d => new AdminDiseaseResponseDTO
            {
                Id             = d.Id,
                Name           = d.Name,
                Description    = d.Description,
                ModelLabel     = d.ModelLabel,
                TreatmentCount = d.DiseaseTreatments.Count
            })
            .OrderBy(d => d.Name)
            .ToListAsync();
    }

    /// <inheritdoc />
    public async Task<AdminDiseaseDetailDTO?> GetDiseaseDetailAsync(int diseaseId)
    {
        var disease = await _context.Diseases
            .Include(d => d.DiseaseTreatments)
                .ThenInclude(dt => dt.Treatment)
            .FirstOrDefaultAsync(d => d.Id == diseaseId);

        if (disease == null) return null;

        return MapToDetailDTO(disease);
    }

    /// <inheritdoc />
    public async Task<AdminDiseaseDetailDTO> CreateDiseaseAsync(AdminCreateDiseaseDTO dto)
    {
        // ModelLabel benzersizlik kontrolü
        var existing = await _context.Diseases
            .FirstOrDefaultAsync(d => d.ModelLabel.ToLower() == dto.ModelLabel.ToLower());

        if (existing != null)
            throw new ArgumentException($"'{dto.ModelLabel}' model etiketiyle eşleşen bir hastalık zaten mevcut.");

        // Disease entity oluştur
        var disease = new Disease
        {
            Name        = dto.Name,
            Description = dto.Description,
            ModelLabel  = dto.ModelLabel
        };

        await _context.Diseases.AddAsync(disease);
        await _context.SaveChangesAsync();

        // Opsiyonel tedaviler varsa ekle
        if (dto.Treatments != null && dto.Treatments.Count > 0)
        {
            foreach (var treatmentDto in dto.Treatments)
            {
                if (!Enum.TryParse<TreatmentType>(treatmentDto.Type, ignoreCase: true, out var type))
                    type = TreatmentType.Natural;

                var treatment = new Treatment
                {
                    Title        = treatmentDto.Title,
                    Instructions = treatmentDto.Instructions,
                    Type         = type
                };

                await _context.Treatments.AddAsync(treatment);
                await _context.SaveChangesAsync();

                // Join table kaydı
                await _context.DiseaseTreatments.AddAsync(new DiseaseTreatment
                {
                    DiseaseId   = disease.Id,
                    TreatmentId = treatment.Id
                });
            }
            await _context.SaveChangesAsync();
        }

        _logger.LogInformation("Yeni hastalık oluşturuldu → Id: {Id}, Ad: {Name}", disease.Id, disease.Name);

        // Detaylı DTO ile dön (tedaviler dahil)
        return (await GetDiseaseDetailAsync(disease.Id))!;
    }

    /// <inheritdoc />
    public async Task<AdminDiseaseDetailDTO?> UpdateDiseaseAsync(int diseaseId, AdminUpdateDiseaseDTO dto)
    {
        var disease = await _context.Diseases.FindAsync(diseaseId);
        if (disease == null) return null;

        if (!string.IsNullOrWhiteSpace(dto.Name))
            disease.Name = dto.Name;

        if (!string.IsNullOrWhiteSpace(dto.Description))
            disease.Description = dto.Description;

        if (!string.IsNullOrWhiteSpace(dto.ModelLabel))
        {
            // ModelLabel benzersizlik kontrolü
            var existing = await _context.Diseases
                .FirstOrDefaultAsync(d => d.ModelLabel.ToLower() == dto.ModelLabel.ToLower() && d.Id != diseaseId);

            if (existing != null)
                throw new ArgumentException($"'{dto.ModelLabel}' model etiketi başka bir hastalık tarafından kullanılıyor.");

            disease.ModelLabel = dto.ModelLabel;
        }

        _context.Entry(disease).State = EntityState.Modified;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Hastalık güncellendi → Id: {Id}", diseaseId);

        return await GetDiseaseDetailAsync(diseaseId);
    }

    /// <inheritdoc />
    public async Task<bool> DeleteDiseaseAsync(int diseaseId)
    {
        var disease = await _context.Diseases.FindAsync(diseaseId);
        if (disease == null) return false;

        _context.Diseases.Remove(disease); // Cascade delete ile tedaviler de silinir
        await _context.SaveChangesAsync();

        _logger.LogInformation("Hastalık silindi → Id: {Id}, Ad: {Name}", diseaseId, disease.Name);
        return true;
    }

    // ──────────────────────────────────────────────────────────────────
    //  Tedavi CRUD
    // ──────────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<TreatmentDTO> AddTreatmentToDiseaseAsync(int diseaseId, AdminCreateTreatmentDTO dto)
    {
        var disease = await _context.Diseases.FindAsync(diseaseId)
            ?? throw new KeyNotFoundException("Hastalık bulunamadı.");

        if (!Enum.TryParse<TreatmentType>(dto.Type, ignoreCase: true, out var type))
            throw new ArgumentException($"Geçersiz tedavi türü: '{dto.Type}'. Geçerli değerler: Natural, Chemical.");

        var treatment = new Treatment
        {
            Title        = dto.Title,
            Instructions = dto.Instructions,
            Type         = type
        };

        await _context.Treatments.AddAsync(treatment);
        await _context.SaveChangesAsync();

        // Join table kaydı
        await _context.DiseaseTreatments.AddAsync(new DiseaseTreatment
        {
            DiseaseId   = diseaseId,
            TreatmentId = treatment.Id
        });
        await _context.SaveChangesAsync();

        _logger.LogInformation("Tedavi eklendi → TreatmentId: {TId}, DiseaseId: {DId}", treatment.Id, diseaseId);

        return new TreatmentDTO
        {
            Id           = treatment.Id,
            Title        = treatment.Title,
            Instructions = treatment.Instructions,
            Type         = treatment.Type.ToString()
        };
    }

    /// <inheritdoc />
    public async Task<TreatmentDTO?> UpdateTreatmentAsync(int treatmentId, AdminUpdateTreatmentDTO dto)
    {
        var treatment = await _context.Treatments.FindAsync(treatmentId);
        if (treatment == null) return null;

        if (!string.IsNullOrWhiteSpace(dto.Title))
            treatment.Title = dto.Title;

        if (!string.IsNullOrWhiteSpace(dto.Instructions))
            treatment.Instructions = dto.Instructions;

        if (!string.IsNullOrWhiteSpace(dto.Type))
        {
            if (!Enum.TryParse<TreatmentType>(dto.Type, ignoreCase: true, out var type))
                throw new ArgumentException($"Geçersiz tedavi türü: '{dto.Type}'.");

            treatment.Type = type;
        }

        _context.Entry(treatment).State = EntityState.Modified;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Tedavi güncellendi → Id: {Id}", treatmentId);

        return new TreatmentDTO
        {
            Id           = treatment.Id,
            Title        = treatment.Title,
            Instructions = treatment.Instructions,
            Type         = treatment.Type.ToString()
        };
    }

    /// <inheritdoc />
    public async Task<bool> DeleteTreatmentAsync(int treatmentId)
    {
        var treatment = await _context.Treatments.FindAsync(treatmentId);
        if (treatment == null) return false;

        _context.Treatments.Remove(treatment);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Tedavi silindi → Id: {Id}", treatmentId);
        return true;
    }

    // ──────────────────────────────────────────────────────────────────
    //  Private Helper — Disease Entity → AdminDiseaseDetailDTO
    // ──────────────────────────────────────────────────────────────────

    private static AdminDiseaseDetailDTO MapToDetailDTO(Disease disease)
    {
        return new AdminDiseaseDetailDTO
        {
            Id          = disease.Id,
            Name        = disease.Name,
            Description = disease.Description,
            ModelLabel  = disease.ModelLabel,
            Treatments  = disease.DiseaseTreatments
                .Where(dt => dt.Treatment != null)
                .Select(dt => new TreatmentDTO
                {
                    Id           = dt.Treatment!.Id,
                    Title        = dt.Treatment.Title,
                    Instructions = dt.Treatment.Instructions,
                    Type         = dt.Treatment.Type.ToString()
                })
                .ToList()
        };
    }
}
