using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

[Route("api/admin/active-learning")]
[Authorize(Roles = "Admin")]
[ApiController]
public class ActiveLearningController : ControllerBase
{
    private readonly IActiveLearningService _activeLearningService;
    private readonly ILogger<ActiveLearningController> _logger;

    public ActiveLearningController(IActiveLearningService activeLearningService, ILogger<ActiveLearningController> logger)
    {
        _activeLearningService = activeLearningService;
        _logger = logger;
    }

    [HttpGet("pending")]
    public async Task<IActionResult> GetPending([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var items = await _activeLearningService.GetPendingAsync(page, pageSize);
        return Ok(items);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var stats = await _activeLearningService.GetStatsAsync();
        return Ok(stats);
    }

    [HttpPost("resolve")]
    public async Task<IActionResult> Resolve([FromBody] ActiveLearningResolveDTO dto)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.CorrectedDisease))
        {
            return BadRequest(new { message = "Geçersiz veri veya boş etiket." });
        }

        var success = await _activeLearningService.ResolveAsync(dto.QueueId, dto.CorrectedDisease);
        if (!success)
            return NotFound(new { message = "Kuyruk öğesi bulunamadı." });
        return Ok(new { message = "Düzeltme başarıyla kaydedildi ve ML servisine gönderildi." });
    }

    [HttpPost("{id}/ignore")]
    public async Task<IActionResult> Ignore(int id)
    {
        var success = await _activeLearningService.IgnoreAsync(id);
        if (!success)
            return NotFound(new { message = "Kuyruk öğesi bulunamadı." });
        return Ok(new { message = "Öğe yoksayıldı." });
    }

    [HttpPost("retrain")]
    public async Task<IActionResult> TriggerRetrain()
    {
        var result = await _activeLearningService.TriggerRetrainAsync();
        return Ok(result);
    }
}
