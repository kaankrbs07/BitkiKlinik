using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

/// <summary>
/// Admin kullanıcılarının hastalık ve tedavi verilerini yönetmesine olanak tanır.
/// Tüm endpoint'ler [Authorize(Roles = "Admin")] ile korunmaktadır.
/// Controller ince tutulmuştur — tüm iş mantığı IAdminDiseaseService'e delege edilir.
/// </summary>
[Route("api/admin/diseases")]
[ApiController]
[Authorize(Roles = "Admin")]
public class AdminDiseasesController : ControllerBase
{
    private readonly IAdminDiseaseService _adminDiseaseService;

    public AdminDiseasesController(IAdminDiseaseService adminDiseaseService)
    {
        _adminDiseaseService = adminDiseaseService;
    }

    // ────────────────────────────────────────────────────────────────
    //  DISEASE CRUD
    // ────────────────────────────────────────────────────────────────

    /// <summary>Tüm hastalıkları tedavi sayılarıyla listele.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAllDiseases()
    {
        var diseases = await _adminDiseaseService.GetAllDiseasesAsync();
        return Ok(diseases);
    }

    /// <summary>Belirli hastalığı tedavileriyle birlikte getir.</summary>
    [HttpGet("{diseaseId}")]
    public async Task<IActionResult> GetDiseaseDetail(int diseaseId)
    {
        var detail = await _adminDiseaseService.GetDiseaseDetailAsync(diseaseId);

        if (detail == null)
            return NotFound(new { Message = "Hastalık bulunamadı." });

        return Ok(detail);
    }

    /// <summary>Yeni hastalık oluştur (opsiyonel tedavilerle).</summary>
    [HttpPost]
    public async Task<IActionResult> CreateDisease([FromBody] AdminCreateDiseaseDTO dto)
    {
        try
        {
            var created = await _adminDiseaseService.CreateDiseaseAsync(dto);
            return CreatedAtAction(nameof(GetDiseaseDetail), new { diseaseId = created.Id }, created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Mevcut hastalığı güncelle.</summary>
    [HttpPut("{diseaseId}")]
    public async Task<IActionResult> UpdateDisease(int diseaseId, [FromBody] AdminUpdateDiseaseDTO dto)
    {
        try
        {
            var updated = await _adminDiseaseService.UpdateDiseaseAsync(diseaseId, dto);
            if (updated == null)
                return NotFound(new { Message = "Hastalık bulunamadı." });

            return Ok(new { Message = "Hastalık başarıyla güncellendi.", Disease = updated });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Hastalığı ve bağlı tedavilerini sil.</summary>
    [HttpDelete("{diseaseId}")]
    public async Task<IActionResult> DeleteDisease(int diseaseId)
    {
        var deleted = await _adminDiseaseService.DeleteDiseaseAsync(diseaseId);

        if (!deleted)
            return NotFound(new { Message = "Hastalık bulunamadı." });

        return Ok(new { Message = "Hastalık ve bağlı tedavileri başarıyla silindi." });
    }

    // ────────────────────────────────────────────────────────────────
    //  TREATMENT CRUD (hastalık bağlamında)
    // ────────────────────────────────────────────────────────────────

    /// <summary>Belirtilen hastalığa yeni tedavi ekle.</summary>
    [HttpPost("{diseaseId}/treatments")]
    public async Task<IActionResult> AddTreatment(int diseaseId, [FromBody] AdminCreateTreatmentDTO dto)
    {
        try
        {
            var treatment = await _adminDiseaseService.AddTreatmentToDiseaseAsync(diseaseId, dto);
            return CreatedAtAction(nameof(GetDiseaseDetail), new { diseaseId }, treatment);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Mevcut tedaviyi güncelle.</summary>
    [HttpPut("treatments/{treatmentId}")]
    public async Task<IActionResult> UpdateTreatment(int treatmentId, [FromBody] AdminUpdateTreatmentDTO dto)
    {
        try
        {
            var updated = await _adminDiseaseService.UpdateTreatmentAsync(treatmentId, dto);
            if (updated == null)
                return NotFound(new { Message = "Tedavi bulunamadı." });

            return Ok(new { Message = "Tedavi başarıyla güncellendi.", Treatment = updated });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Tedaviyi sil.</summary>
    [HttpDelete("treatments/{treatmentId}")]
    public async Task<IActionResult> DeleteTreatment(int treatmentId)
    {
        var deleted = await _adminDiseaseService.DeleteTreatmentAsync(treatmentId);

        if (!deleted)
            return NotFound(new { Message = "Tedavi bulunamadı." });

        return Ok(new { Message = "Tedavi başarıyla silindi." });
    }
}
