using System.Collections.Generic;
using System.Threading.Tasks;
using BitkiKlinik.API.DTOs;

namespace BitkiKlinik.API.Services.Interfaces;

/// <summary>
/// Google Gemini API ile haberleşen servisin arayüzü.
/// </summary>
public interface IGeminiService
{
    /// <summary>
    /// Verilen sistem talimatları ve mesaj geçmişini kullanarak Gemini API'sinden yanıt üretir.
    /// </summary>
    /// <param name="systemInstruction">Modelin karakterini ve RAG bağlamını içeren sistem talimatı.</param>
    /// <param name="chatHistory">Konuşma geçmişi.</param>
    /// <returns>Modelin ürettiği yanıt metni.</returns>
    Task<string> GenerateChatResponseAsync(string systemInstruction, IEnumerable<ChatMessageDTO> chatHistory);
}
