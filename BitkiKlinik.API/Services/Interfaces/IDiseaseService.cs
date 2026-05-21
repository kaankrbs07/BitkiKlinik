using BitkiKlinik.API.Models;

namespace BitkiKlinik.API.Services.Interfaces;

public interface IDiseaseService : IGenericService<Disease>
{
    // Yapay Zeka (Derin Öğrenme) modelinden gelen Python etiketini veritabanındaki hastalıkla eşleştirecek fonksiyon.
    Task<Disease?> GetByModelLabelAsync(string modelLabel);
}
