using System;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using BitkiKlinik.API.Data;
using BitkiKlinik.API.DTOs;
using BitkiKlinik.API.Models;
using BitkiKlinik.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BitkiKlinik.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IScanService _scanService;
    private readonly IDiseaseService _diseaseService;
    private readonly ITreatmentService _treatmentService;
    private readonly IGeminiService _geminiService;
    private readonly ILogger<ChatController> _logger;

    public ChatController(
        ApplicationDbContext context,
        IScanService scanService,
        IDiseaseService diseaseService,
        ITreatmentService treatmentService,
        IGeminiService geminiService,
        ILogger<ChatController> logger)
    {
        _context = context;
        _scanService = scanService;
        _diseaseService = diseaseService;
        _treatmentService = treatmentService;
        _geminiService = geminiService;
        _logger = logger;
    }

    /// <summary>
    /// Yapay Zeka Hekimi ile sohbet etmeyi sağlayan RAG (Retrieval-Augmented Generation) ve Kalıcı Sohbet Geçmişi endpoint'i.
    /// </summary>
    [HttpPost]
    [EnableRateLimiting("ChatPolicy")]
    public async Task<IActionResult> AskAdvisor([FromBody] ChatRequestDTO request)
    {
        if (request == null || request.History == null || !request.History.Any())
            return BadRequest(new { Message = "Sohbet mesajı boş olamaz." });

        try
        {
            var userId = GetCurrentUserId();

            // İstekte SessionId yoksa veya boşsa, uygun bir SessionId belirle/oluştur
            var sessionId = request.SessionId;
            if (string.IsNullOrEmpty(sessionId))
            {
                if (request.ScanId.HasValue)
                {
                    // Bu taramaya ait daha önce oluşturulmuş en son oturumu kullan
                    var existingSessionId = await _context.ChatMessages
                        .Where(m => m.UserId == userId && m.ScanId == request.ScanId.Value)
                        .OrderByDescending(m => m.CreatedDate)
                        .Select(m => m.SessionId)
                        .FirstOrDefaultAsync();

                    sessionId = !string.IsNullOrEmpty(existingSessionId) ? existingSessionId : Guid.NewGuid().ToString();
                }
                else
                {
                    // Genel sohbetler için yeni bir oturum oluştur
                    sessionId = Guid.NewGuid().ToString();
                }
            }

            // 1. Kullanıcının son gönderdiği yeni mesajı veritabanına kaydet
            var latestUserMsg = request.History.LastOrDefault(m => m.Role == "user");
            if (latestUserMsg != null)
            {
                var userMsgEntity = new ChatMessage
                {
                    UserId = userId,
                    ScanId = request.ScanId,
                    SessionId = sessionId,
                    Role = "user",
                    Content = latestUserMsg.Content,
                    CreatedDate = DateTime.UtcNow
                };
                await _context.ChatMessages.AddAsync(userMsgEntity);
                await _context.SaveChangesAsync();
            }

            // 2. RAG sistem talimatlarını (Prompt) hazırla
            string systemInstruction;

            if (request.ScanId.HasValue)
            {
                // Tarama kaydını veritabanından çek
                var scan = await _scanService.GetScanByIdAsync(request.ScanId.Value);
                if (scan == null)
                {
                    return NotFound(new { Message = $"Belirtilen Tarama (ScanId: {request.ScanId.Value}) bulunamadı." });
                }

                // Hastalık detayını ve tedavilerini çek
                var disease = (await _diseaseService.FindAsync(d => d.Name == scan.DiseaseName)).FirstOrDefault();
                TreatmentsResultDTO? treatments = null;
                if (disease != null)
                {
                    treatments = await _treatmentService.GetTreatmentsByDiseaseIdAsync(disease.Id);
                }

                // RAG sistem talimatını hazırla
                var sb = new StringBuilder();
                sb.AppendLine("Sen, 'BitkiKlinik' uygulamasının uzman, cana yakın ve son derece yardımsever 'Yapay Zeka Ziraat Mühendisi' ve Bitki Hekimisin.");
                sb.AppendLine("Kullanıcı, bitkisi için bir AI tarama/teşhis işlemi gerçekleştirdi ve şu oyunca o teşhis hakkında seninle konuşuyor.");
                sb.AppendLine();
                sb.AppendLine("--- ANALİZ EDİLEN BİTKİ BİLGİLERİ ---");
                sb.AppendLine($"- Bitki Türü: {scan.PlantName}");
                sb.AppendLine($"- Teşhis Edilen Durum/Hastalık: {scan.DiseaseName}");
                sb.AppendLine($"- AI Teşhis Güven Oranı: %{Math.Round(scan.Confidence * 100)}");
                
                if (disease != null)
                {
                    sb.AppendLine($"- Hastalık Açıklaması: {disease.Description}");
                }
                
                sb.AppendLine();

                if (treatments != null && (treatments.NaturalTreatments.Any() || treatments.ChemicalTreatments.Any()))
                {
                    sb.AppendLine("--- SİSTEMDE KAYITLI ÖNERİLEN TEDAVİLER ---");
                    
                    if (treatments.NaturalTreatments.Any())
                    {
                        sb.AppendLine("[DOĞAL TEDAVİLER]");
                        foreach (var t in treatments.NaturalTreatments)
                        {
                            sb.AppendLine($"- **{t.Title}**: {t.Instructions}");
                        }
                        sb.AppendLine();
                    }

                    if (treatments.ChemicalTreatments.Any())
                    {
                        sb.AppendLine("[KİMYASAL TEDAVİLER]");
                        foreach (var t in treatments.ChemicalTreatments)
                        {
                            sb.AppendLine($"- **{t.Title}**: {t.Instructions}");
                        }
                        sb.AppendLine();
                    }
                }
                else
                {
                    sb.AppendLine("Not: Bu hastalık/durum için veritabanımızda kayıtlı özel bir kimyasal/doğal tedavi bulunmamaktadır (Sağlıklı bitkiler için de tedavi sunulmaz).");
                }

                sb.AppendLine();
                sb.AppendLine("--- SİZİN İÇİN KURALLAR VE TALİMATLAR ---");
                sb.AppendLine("1. Her zaman kibar, profesyonel, yapıcı ve cesaretlendirici bir ziraat mühendisi gibi konuş.");
                sb.AppendLine("2. Soruları yanıtlarken yukarıda belirtilen bitki, hastalık ve tedavileri BAZ AL. Öncelikle yukarıdaki DOĞAL ve KİMYASAL tedavilerin nasıl uygulanacağını, püf noktalarını açıkla.");
                sb.AppendLine("3. Uygulamamızın tedavilerini ön plana çıkar, uydurma veya sistemimizde olmayan alakasız kimyasal ilaç isimlerini tavsiye etmekten kaçın.");
                sb.AppendLine("4. Çiftçilere pratik, günlük hayatta uygulanabilir tavsiyeler ver. Sulama saatleri, bitki temizliği, güneş ışığı gibi kültürel önlemleri mutlaka hatırlat.");
                sb.AppendLine("5. Yanıtlarını markdown formatında, kalın başlıklar, listeler ve maddeler kullanarak şık ve okunabilir bir şekilde yapılandır.");
                sb.AppendLine("6. Kesinlikle Türkçe konuş.");

                systemInstruction = sb.ToString();
            }
            else
            {
                // Genel Bitki Doktoru sistemi talimatı
                var sb = new StringBuilder();
                sb.AppendLine("Sen, 'BitkiKlinik' uygulamasının uzman, cana yakın ve son derece yardımsever 'Yapay Zeka Ziraat Mühendisi' ve Bitki Hekimisin.");
                sb.AppendLine("Kullanıcı seninle genel bitki bakımı, hastalıklar, sulama ve tarım hakkında konuşuyor.");
                sb.AppendLine();
                sb.AppendLine("--- SİZİN İÇİN KURALLAR VE TALİMATLAR ---");
                sb.AppendLine("1. Her zaman kibar, profesyonel, yapıcı ve cesaretlendirici bir ziraat mühendisi gibi konuş.");
                sb.AppendLine("2. Bitki bakımı, sulama, toprak seçimi, saksı değiştirme, gübreleme ve genel hastalıklar hakkındaki soruları bilimsel, pratik ve anlaşılır bir dille yanıtla.");
                sb.AppendLine("3. Kullanıcıya eğer bitkisinde veya yapraklarında bir leke/hastalık şüphesi varsa, uygulamamızın 'AI Sağlık Taraması' (Kamera taraması) özelliğini kullanarak fotoğraf yükleyip anında kesin teşhis koyabileceğini hatırlat.");
                sb.AppendLine("4. Yanıtlarını markdown formatında, kalın başlıklar, listeler ve maddeler kullanarak şık ve okunabilir bir şekilde yapılandır.");
                sb.AppendLine("5. Kesinlikle Türkçe konuş.");

                systemInstruction = sb.ToString();
            }

            // 3. Veritabanından bu konuşmaya ait son 10 mesajı (sliding window) çekerek Gemini'ye ilet
            // Bu, veritabanı bellek yükünü ve Gemini API token tüketimini optimize eder.
            var dbHistory = await _context.ChatMessages
                .Where(m => m.UserId == userId && m.SessionId == sessionId)
                .OrderByDescending(m => m.CreatedDate)
                .Take(10)
                .ToListAsync();

            var sortedHistory = dbHistory.OrderBy(m => m.CreatedDate);

            var geminiHistory = sortedHistory.Select(m => new ChatMessageDTO
            {
                Role = m.Role,
                Content = m.Content
            }).ToList();

            // 4. Gemini API ile konuş
            var responseText = await _geminiService.GenerateChatResponseAsync(systemInstruction, geminiHistory);

            // 5. Yapay zekanın verdiği yanıtı veritabanına kaydet
            var aiMsgEntity = new ChatMessage
            {
                UserId = userId,
                ScanId = request.ScanId,
                SessionId = sessionId,
                Role = "model",
                Content = responseText,
                CreatedDate = DateTime.UtcNow
            };
            await _context.ChatMessages.AddAsync(aiMsgEntity);
            await _context.SaveChangesAsync();

            return Ok(new { Reply = responseText, SessionId = sessionId });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Chat sırasında hata oluştu.");
            return StatusCode(500, new { Message = "Sohbet servisi geçici olarak yanıt veremiyor.", Error = ex.Message });
        }
    }

    /// <summary>
    /// Kullanıcının aktif olan tüm sohbet oturumlarını gruplayarak tarih sırasına göre listeler.
    /// Oturum başına yalnızca son mesaj çekilir (2 sorgu, tüm geçmişi belleğe almaz).
    /// </summary>
    [HttpGet("sessions")]
    public async Task<IActionResult> GetChatSessions()
    {
        try
        {
            var userId = GetCurrentUserId();

            // Sorgu 1: Her oturum için yalnızca max tarih ve SessionId çek (hafif — navigation property yok)
            var sessionMeta = await _context.ChatMessages
                .Where(m => m.UserId == userId)
                .GroupBy(m => m.SessionId)
                .Select(g => new { SessionId = g.Key, MaxDate = g.Max(m => m.CreatedDate) })
                .OrderByDescending(s => s.MaxDate)
                .ToListAsync();

            if (!sessionMeta.Any())
                return Ok(Enumerable.Empty<object>());

            // Sorgu 2: Her oturum için korelasyonlu alt sorgu — yalnızca son mesajları döndürür
            // SQL: WHERE CreatedDate = MAX(CreatedDate) FOR that SessionId
            var lastMessages = await _context.ChatMessages
                .Where(m => m.UserId == userId &&
                            m.CreatedDate == _context.ChatMessages
                                .Where(m2 => m2.SessionId == m.SessionId && m2.UserId == userId)
                                .Max(m2 => m2.CreatedDate))
                .Include(m => m.Scan)
                .AsNoTracking()
                .ToListAsync();

            // sessionMeta sırasına göre oturumları oluştur (Milisaniye çakışmalarını önlemek için gruplayarak tekilleştiriyoruz)
            var lastMsgBySession = lastMessages
                .GroupBy(m => m.SessionId)
                .ToDictionary(g => g.Key, g => g.First());

            var sessions = sessionMeta
                .Where(s => lastMsgBySession.ContainsKey(s.SessionId))
                .Select(s =>
                {
                    var lastMsg = lastMsgBySession[s.SessionId];
                    var scan = lastMsg.Scan;

                    return new
                    {
                        SessionId = s.SessionId,
                        ScanId = lastMsg.ScanId,
                        PlantName = scan != null ? scan.PlantName : "Genel Danışmanlık",
                        DiseaseName = scan != null ? scan.DiseaseName : "Genel Bitki Soruları",
                        LastMessage = lastMsg.Content.Length > 80 ? lastMsg.Content.Substring(0, 80) + "..." : lastMsg.Content,
                        LastMessageDate = s.MaxDate,
                        IsHealthy = scan == null || scan.Status == Models.Enums.ScanStatus.Healthy,
                        ImageUrl = scan != null ? scan.ImageUrl : null
                    };
                })
                .ToList();

            return Ok(sessions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Chat oturumları listelenirken hata oluştu.");
            return StatusCode(500, new { Message = "Sohbet oturum listesi yüklenemedi.", Error = ex.Message });
        }
    }

    /// <summary>
    /// Belirtilen teşhis taramasına veya sohbet oturumuna ait sohbet geçmişini veritabanından çeker.
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetChatHistory([FromQuery] string? sessionId, [FromQuery] int? scanId)
    {
        try
        {
            var userId = GetCurrentUserId();

            IQueryable<ChatMessage> query = _context.ChatMessages
                .Where(m => m.UserId == userId);

            if (!string.IsNullOrEmpty(sessionId))
            {
                query = query.Where(m => m.SessionId == sessionId);
            }
            else if (scanId.HasValue)
            {
                // Eğer sessionId boşsa ama scanId varsa, bu taramaya ait en sonki sohbet oturumunu bul
                var existingSessionId = await _context.ChatMessages
                    .Where(m => m.UserId == userId && m.ScanId == scanId.Value)
                    .OrderByDescending(m => m.CreatedDate)
                    .Select(m => m.SessionId)
                    .FirstOrDefaultAsync();

                if (!string.IsNullOrEmpty(existingSessionId))
                {
                    query = query.Where(m => m.SessionId == existingSessionId);
                }
                else
                {
                    return Ok(Enumerable.Empty<ChatMessageDTO>());
                }
            }
            else
            {
                // Hem sessionId hem scanId yoksa, en son genel danışmanlık oturumunu bul
                var existingSessionId = await _context.ChatMessages
                    .Where(m => m.UserId == userId && m.ScanId == null)
                    .OrderByDescending(m => m.CreatedDate)
                    .Select(m => m.SessionId)
                    .FirstOrDefaultAsync();

                if (!string.IsNullOrEmpty(existingSessionId))
                {
                    query = query.Where(m => m.SessionId == existingSessionId);
                }
                else
                {
                    return Ok(Enumerable.Empty<ChatMessageDTO>());
                }
            }

            var history = await query
                .OrderBy(m => m.CreatedDate)
                .Select(m => new ChatMessageDTO
                {
                    Role = m.Role,
                    Content = m.Content
                })
                .ToListAsync();

            return Ok(history);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sohbet geçmişi çekilirken hata oluştu.");
            return StatusCode(500, new { Message = "Sohbet geçmişi yüklenemedi.", Error = ex.Message });
        }
    }

    // ── Özel Yardımcılar ──────────────────────────────────────────────

    private int GetCurrentUserId()
    {
        var nameIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(nameIdClaim) || !int.TryParse(nameIdClaim, out var userId))
            throw new UnauthorizedAccessException("Geçersiz veya eksik kullanıcı kimliği.");
        return userId;
    }
}
