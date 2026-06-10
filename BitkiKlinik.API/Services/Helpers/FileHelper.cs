using Microsoft.AspNetCore.Http;
using System;
using System.IO;
using System.Linq;

namespace BitkiKlinik.API.Services.Helpers;

/// <summary>
/// Dosya işlemlerinde kullanılan ortak doğrulama ve yardımcı işlevleri barındırır.
/// </summary>
public static class FileHelper
{
    /// <summary>
    /// İlk byte'ları okuyarak dosya formatını doğrular (magic number kontrolü).
    /// Uzantı sahteciliğine karşı koruma sağlar.
    /// </summary>
    public static void ValidateImageSignature(IFormFile file)
    {
        if (file == null)
            throw new ArgumentNullException(nameof(file));

        // Bilinen görsel format imzaları
        // Her dizi: beklenen byte dizisi + offset
        var signatures = new (byte[] Magic, int Offset)[]
        {
            // JPEG: FF D8 FF
            (new byte[] { 0xFF, 0xD8, 0xFF }, 0),
            // PNG: 89 50 4E 47 0D 0A 1A 0A
            (new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, 0),
            // WebP: RIFF????WEBP (offset 0 = RIFF, offset 8 = WEBP)
            (new byte[] { 0x52, 0x49, 0x46, 0x46 }, 0),   // RIFF prefix
            // GIF87a / GIF89a
            (new byte[] { 0x47, 0x49, 0x46, 0x38 }, 0),
        };

        using var stream = file.OpenReadStream();
        Span<byte> stackHeader = stackalloc byte[12];
        var bytesRead = stream.Read(stackHeader);

        if (bytesRead < 4)
            throw new ArgumentException("Dosya içeriği okunamıyor.");

        var header = stackHeader[..bytesRead].ToArray();

        var isValid = signatures.Any(sig =>
        {
            var (magic, offset) = sig;
            if (header.Length < offset + magic.Length) return false;

            // WebP ek kontrol: ilk 4 byte = RIFF, 8-11. byte = WEBP
            if (magic[0] == 0x52 && header.Length >= 12)
            {
                return header[..4].SequenceEqual(magic)
                    && header[8..12].SequenceEqual("WEBP"u8.ToArray());
            }

            return header.Skip(offset).Take(magic.Length).SequenceEqual(magic);
        });

        if (!isValid)
            throw new ArgumentException(
                "Dosya içeriği görsel formatıyla eşleşmiyor. " +
                "Zararlı veya geçersiz dosya (Magic Number uyumsuzluğu).");

        // IFormFile stream'i paylaşılmış olabilir; başa sar.
        stream.Position = 0;
    }
}
