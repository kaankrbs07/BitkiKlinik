using BitkiKlinik.API.Data;
using BitkiKlinik.API.Models;
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
        // Python modelinden gelen etiketi veritabanındaki ModelLabel ile eşleştirir.
        // Büyük/küçük harf duyarlılığını ortadan kaldırmak ve kırpılmış bir arama yapmak için ToString().ToLower() kullanılabilir.
        return await _context.Set<Disease>()
            .FirstOrDefaultAsync(d => d.ModelLabel.ToLower() == modelLabel.ToLower());
    }
}
