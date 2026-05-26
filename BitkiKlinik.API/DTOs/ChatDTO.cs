using System.Collections.Generic;

namespace BitkiKlinik.API.DTOs;

/// <summary>
/// Tek bir sohbet mesajını temsil eder.
/// </summary>
public class ChatMessageDTO
{
    /// <summary>
    /// Mesajı gönderen taraf: "user" veya "model"
    /// </summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>
    /// Mesaj içeriği
    /// </summary>
    public string Content { get; set; } = string.Empty;
}

/// <summary>
/// Sohbet isteği veri transfer nesnesi.
/// </summary>
public class ChatRequestDTO
{
    /// <summary>
    /// Opsiyonel tarama ID'si. Eğer gönderilirse, teşhis ve tedaviler LLM bağlamına RAG ile dahil edilir.
    /// </summary>
    public int? ScanId { get; set; }

    /// <summary>
    /// Sohbet oturumu benzersiz kimliği (opsiyonel).
    /// </summary>
    public string? SessionId { get; set; }

    /// <summary>
    /// Sohbet mesaj geçmişi (son mesaj da dahil)
    /// </summary>
    public List<ChatMessageDTO> History { get; set; } = new();
}
