using Hangfire;
using Hangfire.Storage;
using Hangfire.Storage.Monitoring;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BitkiKlinik.API.Controllers;

/// <summary>
/// Mobil Admin Paneli için Hangfire İzleme ve Yönetim Uçları.
/// Yalnızca Admin rolüne sahip kullanıcılar erişebilir.
/// </summary>
[Route("api/[controller]")]
[ApiController]
[Authorize(Roles = "Admin")]
public class HangfireAdminController : ControllerBase
{
    // ────────────────────────────────────────────────────────────────
    //  GET  /api/HangfireAdmin/stats
    //  → Hangfire genel durum istatistikleri
    // ────────────────────────────────────────────────────────────────
    [HttpGet("stats")]
    public IActionResult GetStats()
    {
        var monitoringApi = JobStorage.Current.GetMonitoringApi();
        var stats = monitoringApi.GetStatistics();

        return Ok(new
        {
            Failed = stats.Failed,
            Processing = stats.Processing,
            Queued = stats.Enqueued,
            Scheduled = stats.Scheduled,
            Succeeded = stats.Succeeded,
            Servers = stats.Servers,
            Recurring = stats.Recurring
        });
    }

    // ────────────────────────────────────────────────────────────────
    //  GET  /api/HangfireAdmin/jobs/{status}
    //  → Belirli durumdaki (failed, processing, succeeded, etc.) işler
    // ────────────────────────────────────────────────────────────────
    [HttpGet("jobs/{status}")]
    public IActionResult GetJobs(string status, [FromQuery] int from = 0, [FromQuery] int count = 50)
    {
        var monitoringApi = JobStorage.Current.GetMonitoringApi();

        if (status.Equals("failed", StringComparison.OrdinalIgnoreCase))
        {
            var jobs = monitoringApi.FailedJobs(from, count);
            return Ok(jobs.Select(j => new
            {
                Id = j.Key,
                JobName = j.Value.Job?.Method.Name ?? "Bilinmeyen Metot",
                ClassName = j.Value.Job?.Type.Name ?? "Bilinmeyen Sınıf",
                Arguments = j.Value.Job?.Args ?? new List<object>(),
                ExceptionMessage = j.Value.ExceptionMessage,
                ExceptionDetails = j.Value.ExceptionDetails,
                FailedAt = j.Value.FailedAt.HasValue ? DateTime.SpecifyKind(j.Value.FailedAt.Value, DateTimeKind.Utc) : (DateTime?)null
            }));
        }
        else if (status.Equals("processing", StringComparison.OrdinalIgnoreCase))
        {
            var jobs = monitoringApi.ProcessingJobs(from, count);
            return Ok(jobs.Select(j => new
            {
                Id = j.Key,
                JobName = j.Value.Job?.Method.Name ?? "Bilinmeyen Metot",
                ClassName = j.Value.Job?.Type.Name ?? "Bilinmeyen Sınıf",
                Arguments = j.Value.Job?.Args ?? new List<object>(),
                ServerId = j.Value.ServerId,
                StartedAt = j.Value.StartedAt.HasValue ? DateTime.SpecifyKind(j.Value.StartedAt.Value, DateTimeKind.Utc) : (DateTime?)null
            }));
        }
        else if (status.Equals("succeeded", StringComparison.OrdinalIgnoreCase))
        {
            var jobs = monitoringApi.SucceededJobs(from, count);
            return Ok(jobs.Select(j => new
            {
                Id = j.Key,
                JobName = j.Value.Job?.Method.Name ?? "Bilinmeyen Metot",
                ClassName = j.Value.Job?.Type.Name ?? "Bilinmeyen Sınıf",
                Arguments = j.Value.Job?.Args ?? new List<object>(),
                TotalDuration = j.Value.TotalDuration,
                SucceededAt = j.Value.SucceededAt.HasValue ? DateTime.SpecifyKind(j.Value.SucceededAt.Value, DateTimeKind.Utc) : (DateTime?)null
            }));
        }
        else if (status.Equals("scheduled", StringComparison.OrdinalIgnoreCase))
        {
            var jobs = monitoringApi.ScheduledJobs(from, count);
            return Ok(jobs.Select(j => new
            {
                Id = j.Key,
                JobName = j.Value.Job?.Method.Name ?? "Bilinmeyen Metot",
                ClassName = j.Value.Job?.Type.Name ?? "Bilinmeyen Sınıf",
                Arguments = j.Value.Job?.Args ?? new List<object>(),
                EnqueueAt = DateTime.SpecifyKind(j.Value.EnqueueAt, DateTimeKind.Utc),
                ScheduledAt = j.Value.ScheduledAt.HasValue ? DateTime.SpecifyKind(j.Value.ScheduledAt.Value, DateTimeKind.Utc) : (DateTime?)null
            }));
        }
        else if (status.Equals("queued", StringComparison.OrdinalIgnoreCase))
        {
            var queues = monitoringApi.Queues();
            var resultList = new List<object>();
            foreach (var queue in queues)
            {
                var jobs = monitoringApi.EnqueuedJobs(queue.Name, from, count);
                resultList.AddRange(jobs.Select(j => new
                {
                    Queue = queue.Name,
                    Id = j.Key,
                    JobName = j.Value.Job?.Method.Name ?? "Bilinmeyen Metot",
                    ClassName = j.Value.Job?.Type.Name ?? "Bilinmeyen Sınıf",
                    Arguments = j.Value.Job?.Args ?? new List<object>(),
                    EnqueuedAt = j.Value.EnqueuedAt.HasValue ? DateTime.SpecifyKind(j.Value.EnqueuedAt.Value, DateTimeKind.Utc) : (DateTime?)null
                }));
            }
            return Ok(resultList);
        }

        return BadRequest("Geçersiz durum. Geçerli durumlar: failed, processing, succeeded, scheduled, queued.");
    }

    // ────────────────────────────────────────────────────────────────
    //  POST  /api/HangfireAdmin/jobs/{id}/requeue
    //  → Hatalı işi yeniden sıraya alır
    // ────────────────────────────────────────────────────────────────
    [HttpPost("jobs/{id}/requeue")]
    public IActionResult RequeueJob(string id)
    {
        var client = new BackgroundJobClient();
        var success = client.Requeue(id);
        if (success)
        {
            return Ok(new { Success = true, Message = "İş başarıyla yeniden sıraya alındı." });
        }
        return BadRequest(new { Success = false, Message = "İş yeniden sıraya alınamadı." });
    }

    // ────────────────────────────────────────────────────────────────
    //  DELETE  /api/HangfireAdmin/jobs/{id}
    //  → İşi kuyruktan siler (iptal eder)
    // ────────────────────────────────────────────────────────────────
    [HttpDelete("jobs/{id}")]
    public IActionResult DeleteJob(string id)
    {
        var client = new BackgroundJobClient();
        var success = client.Delete(id);
        if (success)
        {
            return Ok(new { Success = true, Message = "İş başarıyla silindi." });
        }
        return BadRequest(new { Success = false, Message = "İş silinemedi." });
    }
}
